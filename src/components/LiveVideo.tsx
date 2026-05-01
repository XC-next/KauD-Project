/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, CameraOff, X, Activity, Play, Square, Loader2, Monitor, Eye } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

interface LiveVideoProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveVideo: React.FC<LiveVideoProps> = ({ isOpen, onClose }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isCamerOn, setIsCameraOn] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const startTimeRef = useRef(0);
  const videoIntervalRef = useRef<any>(null);
  const speechRecognitionRef = useRef<any>(null);

  const startSession = async () => {
    try {
      setError(null);
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.length < 5) {
        const msg = "Live Video Error: Gemini API Key is missing or too short.";
        console.error(msg);
        setError(msg);
        setIsConnecting(false);
        return;
      }

      setIsConnecting(true);
      const ai = new GoogleGenAI({ apiKey });
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: "You are the eyes and ears of KauD Assistant. You are watching a live video feed. Describe what you see when asked, and respond naturally in Khmer and English. Your vision is active.",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            setError(null);
            setupMedia(sessionPromise);
            startSpeechRecognition();
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.modelTurn?.parts) {
              const part = message.serverContent.modelTurn.parts[0];
              if (part.inlineData?.data) {
                handleAudioOutput(part.inlineData.data);
              }
              
              const textPart = message.serverContent.modelTurn.parts.find((p: any) => p.text);
              if (textPart) {
                setAiResponse(prev => prev + textPart.text);
              }
            }
            
            if (message.serverContent?.interrupted) {
              stopAudioPlayback();
            }

            // Note: We use Web Speech API (SpeechRecognition) instead of message.realtimeInputTranscription 
            // for more robust Khmer support and continuous transcription updating.
          },
          onerror: (err) => {
            console.error("Live Video Error (onerror):", err);
            let errorMessage = "Network or Connection Error";
            if (err instanceof Error) {
              errorMessage = err.message;
              console.error("Error Message:", err.message);
              console.error("Error Stack:", err.stack);
            }
            setError(`Connection Failed: ${errorMessage}. Please check your network or API key permissions.`);
            stopSession();
          },
          onclose: (event) => {
            console.log("Live Video session closed:", event);
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to start Live Video session (catch):", err);
      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;
        console.error("Error Message:", err.message);
      }
      setError(`Session Initiation Failed: ${errorMessage}`);
      setIsConnecting(false);
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'km-KH'; // More robust transcription for Khmer
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscription(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
    };

    recognition.start();
    speechRecognitionRef.current = recognition;
  };

  const setupMedia = async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { width: 640, height: 480, frameRate: 15 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        
        sessionPromise.then((session) => {
          if (session) {
            session.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        }).catch(err => console.error("Error sending audio input:", err));
      };
      
      microphoneRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      // Setup Video Frame Capture
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 320;
      canvas.height = 240;

      videoIntervalRef.current = setInterval(() => {
        if (!isCamerOn || !videoRef.current) return;
        
        ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        
        sessionPromise.then((session) => {
          if (session) {
            session.sendRealtimeInput({
              video: { data: base64Data, mimeType: 'image/jpeg' }
            });
          }
        }).catch(err => console.error("Error sending video frame:", err));
      }, 500); // 2 FPS for decent low-latency multimodal
      
    } catch (error) {
      console.error("Media access failed:", error);
    }
  };

  const handleAudioOutput = (base64Audio: string) => {
    if (!audioContextRef.current) return;
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pcmData = new Int16Array(bytes.buffer);
    audioQueueRef.current.push(pcmData);
    if (!isPlayingRef.current) playNextChunk();
  };

  const playNextChunk = () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 0x7FFF;
    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 16000);
    buffer.getChannelData(0).set(floatData);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    const now = audioContextRef.current.currentTime;
    if (startTimeRef.current < now) startTimeRef.current = now;
    source.start(startTimeRef.current);
    startTimeRef.current += buffer.duration;
    source.onended = () => playNextChunk();
  };

  const stopAudioPlayback = () => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const stopSession = () => {
    if (sessionRef.current) sessionRef.current.close();
    sessionRef.current = null;
    
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    
    setIsActive(false);
    setIsConnecting(false);
    setTranscription("");
    setAiResponse("");
  };

  useEffect(() => {
    if (!isOpen) stopSession();
  }, [isOpen]);

  const toggleCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOn(!isCamerOn);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/95 backdrop-blur-2xl"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-4xl bg-[#0C0A09] border border-brand-border rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row"
          >
            {/* Camera View Area */}
            <div className="flex-1 bg-black relative min-h-[300px] md:min-h-[500px]">
              <video 
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!isCamerOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <CameraOff className="w-16 h-16 text-brand-muted" />
                </div>
              )}
              
              {/* Overlays */}
              <div className="absolute top-6 left-6 flex items-center gap-2">
                <div className={cn(
                  "flex items-center gap-2 py-1 px-3 rounded-full text-[10px] font-mono uppercase tracking-widest",
                  isActive ? "bg-red-500 text-white animate-pulse" : "bg-brand-bg/80 text-brand-muted backdrop-blur-md"
                )}>
                  <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-white" : "bg-brand-muted")} />
                  {isActive ? "Live_Vision" : "Standby"}
                </div>
                <div className="bg-brand-bg/80 backdrop-blur-md py-1 px-3 rounded-full text-[10px] font-mono uppercase tracking-widest text-brand-muted">
                  640x480 @ 15fps
                </div>
              </div>

              {/* Hardware Decor */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-brand-border/30 m-4" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-brand-border/30 m-4" />
            </div>

            {/* Controls & Output Sidebar */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-brand-border flex flex-col bg-[#1C1917]/50 backdrop-blur-md">
              <div className="p-6 flex items-center justify-between border-b border-brand-border">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-[#FF6321]" />
                  <span className="text-[10px] font-mono font-black uppercase tracking-widest text-brand-text">Eye_Link.v3</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-brand-bg rounded-lg transition-all text-brand-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 p-6 flex flex-col overflow-hidden">
                <div className="space-y-6 flex-1">
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono text-brand-muted uppercase tracking-[0.2em] flex items-center gap-2">
                      <Activity className="w-3 h-3" /> User_Input
                    </span>
                    <div className="p-4 bg-black/40 border border-brand-border rounded-xl text-xs font-medium text-brand-text min-h-[60px]">
                      {transcription ? `"${transcription}"` : <span className="opacity-40 italic">Waiting for voice...</span>}
                    </div>
                  </div>

                  <div className="space-y-2 flex-1 flex flex-col">
                    <span className="text-[9px] font-mono text-brand-muted uppercase tracking-[0.2em] flex items-center gap-2">
                      <Eye className="w-3 h-3" /> Vision_Analysis
                    </span>
                    <div className={cn(
                      "flex-1 p-4 bg-black/40 border rounded-xl text-xs leading-relaxed overflow-y-auto",
                      error ? "border-red-500/50 text-red-400" : "border-brand-border text-brand-text"
                    )}>
                      {error || aiResponse || "Scanning visual field..."}
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  {isActive ? (
                    <>
                      <div className="flex gap-2">
                        <button 
                          onClick={toggleCamera}
                          className="flex-1 py-3 px-4 bg-brand-bg border border-brand-border rounded-xl text-[10px] font-mono uppercase hover:border-brand-muted transition-all"
                        >
                          {isCamerOn ? <CameraOff className="w-4 h-4 mx-auto" /> : <Camera className="w-4 h-4 mx-auto" />}
                        </button>
                        <button 
                          onClick={stopSession}
                          className="flex-[3] py-3 px-4 bg-red-500 text-white rounded-xl text-[10px] font-mono uppercase font-black tracking-widest hover:bg-red-600 transition-all shadow-lg"
                        >
                          Terminate
                        </button>
                      </div>
                    </>
                  ) : (
                    <button 
                      disabled={isConnecting}
                      onClick={startSession}
                      className="w-full py-4 px-6 bg-[#FF6321] text-white rounded-xl text-[10px] font-mono uppercase font-black tracking-widest hover:bg-[#E5591D] transition-all shadow-lg disabled:opacity-50"
                    >
                      {isConnecting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Initiate Live Link"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
