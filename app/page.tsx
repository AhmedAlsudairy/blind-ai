'use client';
import { useState, useRef, useEffect } from 'react';
import { useFallDetection } from '@/hooks/useFallDetection';
import { useGeminiLive } from '@/hooks/useGeminiLive';
import { Eye, Mic, AlertTriangle, Activity } from 'lucide-react';

export default function BlindAssistLive() {
  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Use the new LIVE hook
  // IMPORTANT: Do NOT expose your API key in a real public app. 
  // Use a backend proxy for production. For this demo, we use ENV.
  const { 
    connect, disconnect, isConnected, isSpeaking, 
    startAudioCapture, sendVideoFrame 
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
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: 640 } 
    });
    if (videoRef.current) videoRef.current.srcObject = stream;
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
    <main className="h-screen bg-neutral-900 text-yellow-400 p-4 flex flex-col font-sans">
      {/* Hidden Video/Canvas for processing */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-yellow-500 pb-4 mb-4">
        <h1 className="text-2xl font-black tracking-tighter">BLIND ASSIST <span className="text-white">LIVE</span></h1>
        <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      </div>

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
      <div className="h-1/3 grid grid-cols-1 gap-4">
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
