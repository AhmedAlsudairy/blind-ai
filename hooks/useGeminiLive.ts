import { useState, useEffect, useRef, useCallback } from 'react';

// Configuration for Gemini Live API
const MODEL = "models/gemini-2.0-flash-exp";
const API_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

export function useGeminiLive(apiKey: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const scheduledTimeRef = useRef(0);

  // 1. Connect to Gemini Live via WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${API_URL}?key=${apiKey}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to Gemini Live");
      setIsConnected(true);
      
      // Handshake: Setup Message
      const setupMsg = {
        setup: {
          model: MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"], // We want the AI to speak back
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } // Select a voice
            }
          }
        }
      };
      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = async (event) => {
        // Handle incoming raw binary data (PCM Audio) or JSON text
        let data;
        if (event.data instanceof Blob) {
            data = JSON.parse(await event.data.text());
        } else {
            data = JSON.parse(event.data);
        }

        // If we receive audio chunks from Gemini
        if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            const base64Audio = data.serverContent.modelTurn.parts[0].inlineData.data;
            const pcmData = base64ToFloat32(base64Audio); // Convert to Playable format
            enqueueAudio(pcmData);
        }
        
        // Handle interruption (User interrupted the AI)
        if (data.serverContent?.interrupted) {
            clearAudioQueue();
        }
    };

    ws.onclose = () => setIsConnected(false);
  }, [apiKey]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    stopAudioCapture();
  }, []);

  // 2. Microphone Capture (16kHz PCM)
  const startAudioCapture = async () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    const ctx = audioContextRef.current;
    
    // Resume context if suspended (browser policy)
    if (ctx.state === 'suspended') await ctx.resume();

    // Load the AudioWorklet module
    try {
        await ctx.audioWorklet.addModule('/pcm-processor.js');
    } catch (e) {
        console.error("Failed to load audio worklet:", e);
        return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        sampleRate: 16000,
    }});

    sourceRef.current = ctx.createMediaStreamSource(stream);
    
    workletNodeRef.current = new AudioWorkletNode(ctx, 'pcm-processor');

    workletNodeRef.current.port.onmessage = (event) => {
        const inputData = event.data;
        // Convert Float32 to Int16 PCM (Base64 encoded)
        const base64PCM = float32ToBase64(inputData);
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64PCM
                    }]
                }
            }));
        }
    };

    sourceRef.current.connect(workletNodeRef.current);
    workletNodeRef.current.connect(ctx.destination);
  };

  const stopAudioCapture = () => {
    sourceRef.current?.disconnect();
    workletNodeRef.current?.disconnect();
    sourceRef.current = null;
    workletNodeRef.current = null;
  };

  // 3. Audio Playback (24kHz PCM)
  const enqueueAudio = (audioData: Float32Array) => {
    audioQueueRef.current.push(audioData);
    if (!isPlayingRef.current) playNextChunk();
  };

  const playNextChunk = () => {
    if (audioQueueRef.current.length === 0) {
        isPlayingRef.current = false;
        setIsSpeaking(false);
        return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    
    const ctx = audioContextRef.current!;
    const audioData = audioQueueRef.current.shift()!;
    
    const buffer = ctx.createBuffer(1, audioData.length, 24000); // Gemini output is 24kHz
    buffer.getChannelData(0).set(audioData);
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    // Seamless playback scheduling
    const currentTime = ctx.currentTime;
    if (scheduledTimeRef.current < currentTime) {
        scheduledTimeRef.current = currentTime;
    }
    
    source.start(scheduledTimeRef.current);
    scheduledTimeRef.current += buffer.duration;
    
    source.onended = () => playNextChunk();
  };

  const clearAudioQueue = () => {
    audioQueueRef.current = [];
    scheduledTimeRef.current = 0;
  };

  // 4. Send Video Frames
  const sendVideoFrame = (base64Image: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
            realtimeInput: {
                mediaChunks: [{
                    mimeType: "image/jpeg",
                    data: base64Image
                }]
            }
        }));
    }
  };

  return { connect, disconnect, isConnected, isSpeaking, startAudioCapture, sendVideoFrame };
}

// --- UTILS ---

// Convert Browser Audio (Float32) to PCM Int16 Base64
function float32ToBase64(buffer: Float32Array) {
    const pcm16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        // Clamp to [-1, 1] and scale to 16-bit
        const s = Math.max(-1, Math.min(1, buffer[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    // Binary string to Base64
    let binary = '';
    const bytes = new Uint8Array(pcm16.buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Convert Base64 PCM Int16 to Float32 for Browser Playback
function base64ToFloat32(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
    }
    return float32;
}
