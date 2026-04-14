import { useState, useEffect } from 'react';

const WORKER_APP_URL = 'http://localhost:5174';

export default function WorkerPlaceholder({ onBack }) {
  const [isLoading, setIsLoading] = useState(true);
  const [appAvailable, setAppAvailable] = useState(false);

  useEffect(() => {
    // Check if worker app is running
    const checkApp = async () => {
      try {
        const response = await fetch(WORKER_APP_URL, { mode: 'no-cors' });
        setAppAvailable(true);
        setIsLoading(false);
      } catch (err) {
        setAppAvailable(false);
        setIsLoading(false);
      }
    };

    checkApp();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-900 via-orange-800 to-orange-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">👷</div>
          <p className="text-xl">Checking worker app...</p>
        </div>
      </div>
    );
  }

  if (appAvailable) {
    return (
      <div className="h-screen w-screen flex flex-col bg-gray-900">
        {/* Header */}
        <div className="bg-orange-950 border-b border-orange-800 p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">👷 Worker App</h1>
          <button onClick={onBack} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition text-white font-semibold flex items-center gap-2">
            🚪 Sign Out
          </button>
        </div>

        {/* App Iframe */}
        <iframe
          src={WORKER_APP_URL}
          className="flex-1 border-0 w-full"
          title="Worker App"
        />
      </div>
    );
  }

  // App not running
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-900 via-orange-800 to-orange-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-orange-950/50 border-b border-orange-800 p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">👷 Worker App</h1>
          <button onClick={onBack} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition flex items-center gap-2">
            🚪 Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4">👷</div>
          <h2 className="text-3xl font-bold mb-2">Worker App Not Running</h2>
          <p className="text-orange-200 mb-6">
            The worker app needs to be started separately.
          </p>

          <div className="bg-orange-800/50 border border-orange-700 rounded-lg p-6 mb-6">
            <p className="text-sm text-orange-100 mb-4">
              <strong>To start the Worker app:</strong>
            </p>
            <ol className="text-left space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="font-bold text-orange-300">1.</span>
                <span>Open a new terminal window</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-orange-300">2.</span>
                <span>Run: <code className="bg-orange-950 px-2 py-1 rounded inline-block mt-1 w-full">cd worker-app && npm run dev</code></span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-orange-300">3.</span>
                <span>Wait for the app to start on port <code className="bg-orange-950 px-2 py-1 rounded">5174</code></span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-orange-300">4.</span>
                <span>Come back and click "Back to Roles" then "Worker" again</span>
              </li>
            </ol>
          </div>

          <button
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => window.location.reload(), 1000);
            }}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 rounded-lg transition font-semibold w-full"
          >
            🔄 Retry Loading
          </button>
        </div>
      </div>
    </div>
  );
}
