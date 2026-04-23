import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

function App() {
  const [inputPath, setInputPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unlistenProgress = listen<number>('redaction-progress', (event) => {
      setProgress(event.payload);
    });
    
    const unlistenStatus = listen<string>('redaction-status', (event) => {
      setStatus(event.payload);
      if (event.payload === 'DONE' || event.payload === 'COMPLETE') {
        setProgress(100);
        setIsProcessing(false);
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenStatus.then(f => f());
    };
  }, []);

  const handleRedact = async () => {
    if (!inputPath || !outputPath) return;
    setIsProcessing(true);
    setProgress(0);
    setStatus('Initializing Tauri Sidecar...');
    try {
      await invoke('redact_video', { input: inputPath, output: outputPath });
    } catch (e) {
      setStatus('Error: ' + String(e));
      setIsProcessing(false);
    }
  };

  const handleSelectInput = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }],
    });
    if (selected && typeof selected === 'string') {
      setInputPath(selected);
    }
  };

  const handleSelectOutput = async () => {
    const selected = await save({
      filters: [{ name: 'Videos', extensions: ['mp4'] }],
      defaultPath: inputPath ? inputPath.replace(/\.[^/.]+$/, "") + "_redacted.mp4" : "output.mp4",
    });
    if (selected && typeof selected === 'string') {
      setOutputPath(selected);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-slate-900 text-slate-100 font-sans">
      <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
        Redactify AI
      </h1>

      <div className="w-full max-w-md bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-6 flex flex-col gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Input Video File</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="C:\path\to\input.mp4" 
              className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-sm"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              disabled={isProcessing}
            />
            <button 
              onClick={handleSelectInput}
              disabled={isProcessing}
              className="px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors font-medium text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Browse...
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Output Video File</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="C:\path\to\output.mp4" 
              className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all text-sm"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              disabled={isProcessing}
            />
            <button 
              onClick={handleSelectOutput}
              disabled={isProcessing}
              className="px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors font-medium text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Browse...
            </button>
          </div>
        </div>

        <button 
          onClick={handleRedact}
          disabled={isProcessing || !inputPath || !outputPath}
          className="w-full py-3 mt-2 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold rounded-lg shadow-md transition-all active:scale-[0.98]"
        >
          {isProcessing ? 'Processing...' : 'Redact Video'}
        </button>

        {status && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-slate-300">{status}</span>
              <span className="text-emerald-400">{progress}%</span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
