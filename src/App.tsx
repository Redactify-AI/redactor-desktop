import { useState, useEffect, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { 
  FileVideo, 
  Settings2, 
  PlaySquare, 
  ArrowLeft,
  Loader2,
  Save,
  ShieldCheck,
  Eye,
  EyeOff,
  Circle,
  Square,
  Box,
  CircleDot
} from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';

function App() {
  const [inputPath, setInputPath] = useState('');
  const [tempOutputPath, setTempOutputPath] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [processState, setProcessState] = useState<'idle' | 'processing' | 'finished'>('idle');
  
  const isProcessing = processState === 'processing';
  const isComplete = processState === 'finished';
  
  const [isComparing, setIsComparing] = useState(false);
  const [previewImgPath, setPreviewImgPath] = useState('');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const [paddingRatio, setPaddingRatio] = useState(0.20);
  const [blurStrength, setBlurStrength] = useState(15);
  const [blurShape, setBlurShape] = useState('oval');

  const [lastProcessedSettings, setLastProcessedSettings] = useState<{ paddingRatio: number, blurStrength: number, blurShape: string } | null>(null);
  const pendingSettingsRef = useRef<{ paddingRatio: number, blurStrength: number, blurShape: string } | null>(null);

  const activeVideoPath = (isComplete && tempOutputPath) ? tempOutputPath : inputPath;
  const videoUrl = activeVideoPath ? convertFileSrc(activeVideoPath) : '';
  const previewUrl = previewImgPath ? `${convertFileSrc(previewImgPath)}?t=${Date.now()}` : '';

  const isDirty = !lastProcessedSettings || 
    lastProcessedSettings.paddingRatio !== paddingRatio || 
    lastProcessedSettings.blurStrength !== blurStrength || 
    lastProcessedSettings.blurShape !== blurShape;

  const isFinishedAndClean = isComplete && !isDirty;

  useEffect(() => {
    const unlistenProgress = listen<number>('redaction-progress', (event) => {
      setProgress(event.payload);
    });
    
    const unlistenStatus = listen<string>('redaction-status', (event) => {
      setStatus(event.payload);
      if (event.payload === 'DONE' || event.payload === 'COMPLETE') {
        setProgress(100);
        setProcessState('finished');
        if (pendingSettingsRef.current) {
          setLastProcessedSettings(pendingSettingsRef.current);
        }
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenStatus.then(f => f());
    };
  }, []);

  const [previewError, setPreviewError] = useState('');

  // Debounced effect for Live Preview
  useEffect(() => {
    if (!inputPath || isProcessing || isComplete) return;

    const generatePreview = async () => {
      setIsGeneratingPreview(true);
      setPreviewError('');
      try {
        const pPath = await invoke('generate_preview', {
          input: inputPath,
          paddingRatio,
          blurStrength,
          shape: blurShape
        });
        setPreviewImgPath(pPath as string);
      } catch (e) {
        console.error("Preview generation failed", e);
        setPreviewError(String(e));
      } finally {
        setIsGeneratingPreview(false);
      }
    };

    const timer = setTimeout(() => {
      generatePreview();
    }, 300);

    return () => clearTimeout(timer);
  }, [inputPath, paddingRatio, blurStrength, blurShape, isProcessing, isComplete]);

  const handleRedact = async () => {
    if (!inputPath) return;
    pendingSettingsRef.current = { paddingRatio, blurStrength, blurShape };
    setProcessState('processing');
    setProgress(0);
    setStatus('Initializing Tauri Sidecar...');
    try {
      const tempPath = await invoke('redact_video', { 
        input: inputPath, 
        paddingRatio,
        blurStrength,
        shape: blurShape
      });
      setTempOutputPath(tempPath as string);
    } catch (e) {
      setStatus('Error: ' + String(e));
      setProcessState('idle');
    }
  };

  const handleSelectInput = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov'] }],
    });
    if (selected && typeof selected === 'string') {
      setInputPath(selected);
      // Reset progress/status for new video
      setProgress(0);
      setStatus('');
      setProcessState('idle');
      setTempOutputPath('');
      setPreviewImgPath('');
      setIsComparing(false);
      setLastProcessedSettings(null);
      pendingSettingsRef.current = null;
    }
  };

  const handleSaveFinal = async () => {
    const selected = await save({
      filters: [{ name: 'Videos', extensions: ['mp4'] }],
      defaultPath: inputPath ? inputPath.replace(/\.[^/.]+$/, "") + "_redacted.mp4" : "output.mp4",
    });
    
    if (selected && typeof selected === 'string') {
      try {
        await invoke('save_final_video', { tempPath: tempOutputPath, destinationPath: selected });
        setStatus('Saved successfully!');
        
        setTimeout(() => {
          setProcessState('idle');
          setProgress(0);
          setStatus('');
          setTempOutputPath('');
        }, 3000);
      } catch (e) {
        setStatus('Failed to save: ' + String(e));
      }
    }
  };

  const handleClearVideo = () => {
    if (isProcessing) return; // Prevent clearing while processing
    setInputPath('');
    setTempOutputPath('');
    setProgress(0);
    setStatus('');
    setProcessState('idle');
    setPreviewImgPath('');
    setIsComparing(false);
    setLastProcessedSettings(null);
    pendingSettingsRef.current = null;
  };

  // -------------------------------------------------------------
  // VIEW 1: LANDING PAGE
  // -------------------------------------------------------------
  if (!inputPath) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500/30 p-6">
        <div className="w-full max-w-lg text-center flex flex-col items-center">
          
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm mb-6">
              <ShieldCheck className="w-8 h-8 text-zinc-100" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 mb-3">
              Redactify Workspace
            </h1>
            <p className="text-base text-zinc-400">
              Secure, on-device AI video redaction. Drag & drop or browse to get started.
            </p>
          </div>

          <button 
            onClick={handleSelectInput}
            className="group w-full aspect-video flex flex-col items-center justify-center gap-4 bg-[#18181b] hover:bg-zinc-900 border-2 border-dashed border-zinc-800 hover:border-zinc-600 rounded-2xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:ring-offset-4 focus:ring-offset-[#09090b]"
          >
            <div className="p-4 rounded-full bg-zinc-800/50 group-hover:bg-zinc-800 transition-colors">
              <FileVideo className="w-8 h-8 text-zinc-400 group-hover:text-zinc-200" />
            </div>
            <div className="text-center">
              <span className="block text-base font-medium text-zinc-200">
                Browse Video (.mp4, .mov)
              </span>
              <span className="block mt-1 text-sm text-zinc-500">
                Click to open local file explorer
              </span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: EDITOR WORKSPACE
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-zinc-100 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* Top Header Navigation */}
      <header className="flex-none h-14 bg-[#09090b] border-b border-zinc-800/80 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleClearVideo}
            disabled={isProcessing}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600"
            title="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-px h-5 bg-zinc-800 mx-1"></div>
          <ShieldCheck className="w-5 h-5 text-zinc-100" />
          <span className="text-sm font-semibold tracking-tight text-zinc-100">Redactify</span>
        </div>
        <div className="text-xs text-zinc-500 font-medium">Local AI Engine Ready</div>
      </header>

      {/* Main Split Pane Workspace */}
      <Group orientation="horizontal" className="flex-1 w-full h-full">
        
        {/* Left Panel: Video Preview */}
        <Panel defaultSize={70} minSize={40} className="flex flex-col relative bg-[#0f0f11]">
          <div className="absolute inset-0 flex flex-col p-6">
            <div className="flex-none flex items-center gap-2 mb-4">
              <PlaySquare className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-400">Preview Player</h2>
            </div>
            
            <div className="flex-1 min-h-0 bg-black rounded-xl border border-zinc-800 shadow-inner shadow-black/50 overflow-hidden flex items-center justify-center relative">
              {!isComparing && !isFinishedAndClean ? (
                <>
                  {previewImgPath ? (
                    <img 
                      src={previewUrl} 
                      alt="Redaction Preview" 
                      className="w-full h-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-zinc-500 text-sm flex flex-col items-center gap-2 px-4 text-center">
                      {previewError ? (
                        <>
                          <div className="text-red-400 font-medium">Failed to generate preview</div>
                          <div className="text-xs text-red-400/70">{previewError}</div>
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          Generating preview...
                        </>
                      )}
                    </div>
                  )}
                  {isGeneratingPreview && previewImgPath && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    </div>
                  )}
                </>
              ) : (
                <video 
                  src={videoUrl} 
                  controls 
                  className="w-full h-full max-h-full object-contain"
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate"
                />
              )}
            </div>
            
            <div className="flex-none mt-4 flex items-center justify-between">
              <div className="text-xs text-zinc-500 truncate" title={activeVideoPath}>
                {isFinishedAndClean ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    Previewing Redacted Video
                  </span>
                ) : (
                  <>Source: <span className="text-zinc-400 font-mono">{inputPath}</span></>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {/* Resizer Handle */}
        <Separator className="w-1.5 bg-zinc-900 hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors flex flex-col items-center justify-center cursor-col-resize group border-x border-zinc-800/30">
          <div className="w-0.5 h-8 bg-zinc-700 rounded-full group-hover:bg-indigo-400 transition-colors"></div>
        </Separator>

        {/* Right Panel: Controls & Settings */}
        <Panel defaultSize={30} minSize={25} className="bg-[#141416] flex flex-col border-l border-zinc-800/50">
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 className="w-5 h-5 text-zinc-100" />
                  <h2 className="text-lg font-medium text-zinc-100">Redaction Settings</h2>
                </div>
                <p className="text-xs text-zinc-400">Configure AI face detection and blur intensity.</p>
              </div>
              
              {/* Show Original Toggle */}
              <button
                onClick={() => setIsComparing(!isComparing)}
                disabled={isProcessing || isComplete || !previewImgPath}
                className={`flex items-center gap-1.5 flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 shadow-sm select-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#141416] ${isComparing ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50'}`}
              >
                {isComparing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {isComparing ? 'Showing Original' : 'Show Original'}
              </button>
            </div>

            {/* Blur Shape Selection */}
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">Blur Shape</label>
              <div className="flex bg-[#09090b] p-1 rounded-lg border border-zinc-800/80 shadow-inner">
                {[
                  { id: 'oval', label: 'Oval', icon: Circle },
                  { id: 'circle', label: 'Circle', icon: CircleDot },
                  { id: 'rect', label: 'Rect', icon: Square },
                  { id: 'rounded', label: 'Rounded', icon: Box },
                ].map((shapeOption) => {
                  const Icon = shapeOption.icon;
                  const isActive = blurShape === shapeOption.id;
                  return (
                    <button
                      key={shapeOption.id}
                      onClick={() => setBlurShape(shapeOption.id)}
                      disabled={isProcessing}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-all ${isActive ? 'bg-zinc-800 text-zinc-100 shadow-sm ring-1 ring-zinc-700/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'} focus:outline-none focus:ring-2 focus:ring-zinc-600 disabled:opacity-50`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {shapeOption.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">Blur Area Size</label>
                  <span className="text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-md tabular-nums shadow-sm">{paddingRatio.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  min="0.0" 
                  max="1.0" 
                  step="0.05"
                  value={paddingRatio}
                  onChange={(e) => setPaddingRatio(parseFloat(e.target.value))}
                  disabled={isProcessing}
                  className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 focus:ring-offset-[#141416] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">Blur Intensity</label>
                  <span className="text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-md tabular-nums shadow-sm">{blurStrength}</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="50" 
                  step="1"
                  value={blurStrength}
                  onChange={(e) => setBlurStrength(parseInt(e.target.value))}
                  disabled={isProcessing}
                  className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 focus:ring-offset-[#141416] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                />
              </div>
            </div>
          </div>

          {/* Fixed Bottom Action Area */}
          <div className="flex-none p-6 bg-[#18181b] border-t border-zinc-800 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
            {(processState === 'idle' || (processState === 'finished' && isDirty)) && (
              <button 
                onClick={handleRedact}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-[#18181b]"
              >
                {processState === 'finished' ? 'Update Redaction' : 'Start Redaction'}
              </button>
            )}

            {processState === 'processing' && (
              <div className="w-full space-y-3 py-1">
                <div className="flex justify-between items-center text-xs font-medium">
                  <span className="text-zinc-300 truncate max-w-[80%] pr-4 flex items-center gap-2" title={status}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    {status}
                  </span>
                  <span className="text-zinc-100 tabular-nums font-mono">{progress}%</span>
                </div>
                
                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden shadow-inner border border-zinc-800/50">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out relative"
                    style={{ width: `${progress}%` }}
                  >
                    {/* Shimmer effect for active progress */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                  </div>
                </div>
              </div>
            )}

            {processState === 'finished' && !isDirty && (
              <button 
                onClick={handleSaveFinal}
                className="w-full relative overflow-hidden group py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all duration-300 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[#18181b] border border-emerald-400/30 hover:-translate-y-0.5"
              >
                <div className="absolute inset-0 w-full h-full bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <Save className="w-5 h-5 drop-shadow-md" />
                <span className="drop-shadow-md tracking-wide">Save Redacted Video As...</span>
              </button>
            )}
          </div>
        </Panel>

      </Group>
      
      {/* Optional: Define shimmer animation directly in a style tag for the active progress bar */}
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export default App;
