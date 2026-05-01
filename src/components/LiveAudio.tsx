/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Volume2, X, Activity, Play, Square, Loader2 } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

interface LiveAudioProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveAudio: React.FC<LiveAudioProps> = ({ isOpen, onClose }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const startTimeRef = useRef(0);
  const speechRecognitionRef = useRef<any>(null);

  const startSession = async () => {
    try {
      setError(null);
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.length < 5) {
        const msg = "Live Audio Error: Gemini API Key is missing or too short.";
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
          systemInstruction: "You are KauD Assistant. Respond naturally and helpfully in Khmer. Keep responses concise for voice interaction.",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            setError(null);
            setupMicrophone(sessionPromise);
            startSpeechRecognition();
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.modelTurn?.parts) {
              const part = message.serverContent.modelTurn.parts[0];
              if (part.inlineData?.data) {
                const base64Audio = part.inlineData.data;
                handleAudioOutput(base64Audio);
              }
            }
            
            if (message.serverContent?.interrupted) {
              stopAudioPlayback();
            }

            if (message.serverContent?.modelTurn?.parts?.[1]?.text) {
              setAiResponse(prev => prev + message.serverContent.modelTurn.parts[1].text);
            }
            
            // Note: We use Web Speech API (SpeechRecognition) instead of message.realtimeInputTranscription 
            // for more robust Khmer support and continuous transcription updating.
            
            const modelTranscript = message.serverContent?.modelTurn?.parts?.find((p: any) => p.text)?.text;
            if (modelTranscript) {
              setAiResponse(prev => prev + modelTranscript);
            }
          },
          onerror: (err) => {
            console.error("Live API Error (onerror):", err);
            let errorMessage = "Connection failed";
            if (err instanceof Error) {
              errorMessage = err.message;
              console.error("Error Message:", err.message);
            }
            setError(`Audio Session Error: ${errorMessage}. Please check your connection.`);
            stopSession();
          },
          onclose: (event) => {
            console.log("Live Audio session closed:", event);
            setIsActive(false);
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to start Live Audio session (catch):", err);
      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;
        console.error("Error Message:", err.message);
      }
      setError(`Audio Initialization Failed: ${errorMessage}`);
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

  const setupMicrophone = async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // ScriptProcessor is deprecated but reliable for small base64 chunks in this context
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processorRef.current.onaudioprocess = (e) => {
        if (isMuted) return;
        
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
    } catch (error) {
      console.error("Microphone access failed:", error);
    }
  };

  const handleAudioOutput = (base64Audio: string) => {
    if (!audioContextRef.current) return;
    
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcmData = new Int16Array(bytes.buffer);
    audioQueueRef.current.push(pcmData);
    
    if (!isPlayingRef.current) {
      playNextChunk();
    }
  };

  const playNextChunk = () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }

    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 16000);
    buffer.getChannelData(0).set(floatData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    const now = audioContextRef.current.currentTime;
    if (startTimeRef.current < now) {
      startTimeRef.current = now;
    }
    
    source.start(startTimeRef.current);
    startTimeRef.current += buffer.duration;
    
    source.onended = () => {
      playNextChunk();
    };
  };

  const stopAudioPlayback = () => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    // Note: stopping active sources would require keeping track of them
  };

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    
    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    
    setIsActive(false);
    setIsConnecting(false);
    setTranscription("");
    setAiResponse("");
  };

  useEffect(() => {
    if (!isOpen) {
      stopSession();
    }
  }, [isOpen]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full max-w-lg bg-[#0C0A09] border border-brand-border rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-brand-border flex items-center justify-between bg-[#1C1917]">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-xl border transition-all",
                  isActive ? "bg-red-500/10 border-red-500/50 text-red-500" : "bg-brand-bg border-brand-border text-brand-muted"
                )}>
                  <Activity className={cn("w-5 h-5", isActive && "animate-pulse")} />
                </div>
                <div>
                  <h2 className="text-sm font-mono font-black uppercase tracking-widest text-brand-text">Audio Live Stream</h2>
                  <p className="text-[10px] font-mono text-brand-muted uppercase">Kernel: Direct_Vocal_Link</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-brand-bg rounded-full transition-all text-brand-muted hover:text-brand-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visualize Area */}
            <div className="p-12 flex flex-col items-center justify-center gap-8 min-h-[300px]">
              <div className="relative">
                <div className={cn(
                  "w-32 h-32 rounded-full border-2 flex items-center justify-center transition-all duration-500",
                  isActive 
                    ? "border-[#FF6321] scale-110 shadow-[0_0_50px_rgba(255,99,33,0.2)]" 
                    : "border-brand-border scale-100"
                )}>
                  {isActive ? (
                    <div className="flex gap-1 items-end h-8">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <motion.div 
                          key={i}
                          animate={{ height: [8, Math.random() * 32 + 8, 8] }}
                          transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                          className="w-1.5 bg-[#FF6321] rounded-full"
                        />
                      ))}
                    </div>
                  ) : (
                    <Volume2 className="w-8 h-8 text-brand-muted" />
                  )}
                </div>
                {isActive && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 rounded-full border border-[#FF6321]"
                  />
                )}
              </div>

              <div className="text-center space-y-2">
                <h3 className="font-mono text-xs uppercase tracking-[0.3em] text-brand-muted">
                  {isConnecting ? "Establishing Link..." : isActive ? "System Online" : "Ready to Connect"}
                </h3>
                {transcription && (
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm font-medium text-brand-text max-w-sm"
                  >
                    "{transcription}"
                  </motion.p>
                )}
              </div>
            </div>

            {/* Console Output */}
            <div className="px-8 pb-8 space-y-4">
              <div className="bg-black/50 border border-brand-border rounded-2xl p-4 h-24 overflow-y-auto font-mono text-[10px]">
                <div className="text-[#FF6321] mb-1 tracking-widest uppercase opacity-70">Model_Output:</div>
                <div className={cn("leading-relaxed", error ? "text-red-400" : "text-brand-text")}>
                  {error || aiResponse || "Waiting for signal..."}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                {isActive ? (
                  <>
                    <button 
                      onClick={toggleMute}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-2xl border transition-all font-mono text-xs uppercase tracking-widest",
                        isMuted 
                          ? "bg-red-500/10 border-red-500/30 text-red-500" 
                          : "bg-brand-bg border-brand-border text-brand-text hover:border-brand-muted"
                      )}
                    >
                      {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      {isMuted ? "Unmute" : "Mute"}
                    </button>
                    <button 
                      onClick={stopSession}
                      className="flex-1 flex items-center justify-center gap-2 py-4 px-6 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all font-mono text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(239,68,68,0.3)]"
                    >
                      <Square className="w-4 h-4" />
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button 
                    disabled={isConnecting}
                    onClick={startSession}
                    className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-[#FF6321] text-white rounded-2xl hover:bg-[#E5591D] transition-all font-mono text-xs uppercase tracking-widest shadow-[0_4px_30px_rgba(255,99,33,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    )}
                    {isConnecting ? "Connecting..." : "Initialize Neural Link"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// Helper function
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
