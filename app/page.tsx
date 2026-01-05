'use client';
import { useState, useRef, useEffect } from 'react';
import { useFallDetection } from '@/hooks/useFallDetection';
import { useGeminiLive } from '@/hooks/useGeminiLive';
import { Eye, Mic, AlertTriangle, Activity, Settings, Terminal } from 'lucide-react';

export default function BlindAssistLive() {
  const [active, setActive] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use the new LIVE hook
  // IMPORTANT: Do NOT expose your API key in a real public app. 
  // Use a backend proxy for production. For this demo, we use ENV.
  const { 
    connect, disconnect, isConnected, isSpeaking, 
    startAudioCapture, sendVideoFrame,
    error, logs, audioDevices, selectedAudioOutput, setAudioOutput
  } = useGeminiLive(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

  // Start/Stop Logic
  const toggleSystem = async () => {
    if (active) {
      disconnect();
      setActive(false);
    } else {
      connect();
      // Wait a moment for connection, then start mic
      setTimeout(() => startAudioCapture(), 1000); 
      startCamera();
      setActive(true);
    }
  };

  // Camera Logic
  const startCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: 640 } 
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
        console.error("Camera failed", e);
    }
  };

  // Video Frame Loop (1 FPS is enough for context, saves bandwidth)
  useEffect(() => {
    if (!active || !isConnected) return;
    
    const interval = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const ctx = canvasRef.current.getContext('2d');
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx?.drawImage(videoRef.current, 0, 0);
        
        // Quality 0.5 JPEG
        const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
        sendVideoFrame(base64);
    }, 1000); 

    return () => clearInterval(interval);
  }, [active, isConnected]);

  // Fall Detection (Same as before)
  useFallDetection(() => {
    // If fall detected, maybe tell Gemini to scream for help?
    // Or trigger standard SOS
    alert("FALL DETECTED"); 
  });

  return (
    <main className="h-screen bg-neutral-900 text-yellow-400 p-4 flex flex-col font-sans relative overflow-hidden">
      {/* Hidden Video/Canvas for processing */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-yellow-500 pb-4 mb-4 z-10">
        <h1 className="text-2xl font-black tracking-tighter">BLIND ASSIST <span className="text-white">LIVE</span></h1>
        <div className="flex gap-2 items-center">
            <button onClick={() => setShowDebug(!showDebug)} className="p-2 bg-yellow-900/50 rounded-full">
                <Terminal size={16} />
            </button>
            <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-600 text-white p-2 rounded mb-4 flex items-center gap-2 animate-bounce">
            <AlertTriangle />
            <span className="font-bold">{error}</span>
        </div>
      )}

      {/* Debug Overlay */}
      {showDebug && (
        <div className="absolute top-20 left-4 right-4 bg-black/90 border border-yellow-500 p-4 rounded-lg z-50 max-h-64 overflow-y-auto text-xs font-mono text-green-400">
            <h3 className="text-white border-b border-gray-700 mb-2 pb-1">System Logs</h3>
            {logs.map((log, i) => (
                <div key={i}>{log}</div>
            ))}
            
            {/* Audio Output Selector */}
            {audioDevices.length > 0 && (
                <div className="mt-4 pt-2 border-t border-gray-700">
                    <label className="text-white block mb-1">Audio Output:</label>
                    <select 
                        value={selectedAudioOutput} 
                        onChange={(e) => setAudioOutput(e.target.value)}
                        className="w-full bg-gray-800 text-white p-1 rounded"
                    >
                        {audioDevices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
      )}

      {/* Main Visualizer */}
      <div className="flex-1 flex flex-col items-center justify-center relative rounded-2xl border-2 border-yellow-900 bg-black/50 overflow-hidden mb-6">
         {/* Live Audio Visualizer (Simple Circle) */}
         <div 
            className={`transition-all duration-200 rounded-full border-4 border-white
            ${isSpeaking ? 'w-64 h-64 bg-yellow-400/20 animate-pulse' : 'w-32 h-32 bg-transparent'}
            flex items-center justify-center`}
         >
            {isSpeaking ? <Activity size={64} /> : <Mic size={32} className="opacity-50"/>}
         </div>
         <p className="mt-8 text-xl text-center px-4 font-mono text-white/80">
            {isConnected ? "Listening & Watching..." : "System Offline"}
         </p>
      </div>

      {/* Controls */}
      <div className="h-1/3 grid grid-cols-1 gap-4 z-10">
        <button 
          onClick={toggleSystem}
          className={`w-full h-full rounded-2xl flex flex-col items-center justify-center text-4xl font-black uppercase tracking-widest transition-all
            ${active ? 'bg-white text-black border-4 border-yellow-400' : 'bg-yellow-400 text-black shadow-[0_0_30px_rgba(250,204,21,0.4)]'}
          `}
        >
          {active ? "STOP SYSTEM" : "START ASSIST"}
        </button>
      </div>
    </main>
  );
}
