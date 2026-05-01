/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, 
  Bot, 
  User, 
  Plus, 
  Settings, 
  History, 
  Search, 
  Menu, 
  X,
  Sparkles,
  Command,
  Zap,
  Info,
  Copy,
  Trash2,
  RotateCcw,
  Check,
  Code,
  ZapOff,
  Brain,
  Terminal,
  ExternalLink,
  Paperclip,
  Square,
  Edit2,
  FileText,
  Image as ImageIcon,
  Video,
  Camera,
  Mic,
  User as UserIcon,
  CircleUser as UserCircle,
  FileCode,
  File,
  Calendar,
  Mail,
  ShieldCheck,
  Clock,
  Activity,
  Shield,
  Award,
  Crown,
  Cpu,
  Fingerprint,
  Database,
  Layers,
  Monitor,
  Video as VideoIcon,
  Quote,
  ArrowLeft
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { ai, createChat, summarizeMessages, DEFAULT_SYSTEM_INSTRUCTION, AVAILABLE_MODELS } from "./services/gemini";
import { LiveAudio } from "./components/LiveAudio";
import { LiveVideo } from "./components/LiveVideo";
import { translations, Language } from "./translations";

const getPersonaNameKey = (id: string) => {
  switch (id) {
    case 'creative': return 'creativePersona';
    case 'coder': return 'coderPersona';
    case 'analyst': return 'analystPersona';
    case 'minimal': return 'minimalPersona';
    default: return 'defaultPersona';
  }
};

const PERSONAS = [
  { 
    id: "default", 
    name: "Standard", 
    icon: <Bot className="w-3.5 h-3.5" />, 
    instruction: "You are KauD Assistant, a Knowledge and Utility Design assistant. You are precise, efficient, and helpful. Focus on providing high-quality assistance in Khmer." 
  },
  { 
    id: "creative", 
    name: "Creative", 
    icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />, 
    instruction: "You are a creative muse. Your responses are imaginative, descriptive, and focus on storytelling and out-of-the-box thinking. Express your creativity in Khmer." 
  },
  { 
    id: "coder", 
    name: "Developer", 
    icon: <Code className="w-3.5 h-3.5 text-blue-400" />, 
    instruction: "You are an expert software engineer. Provide code-first solutions, explain architectural patterns, and prioritize best practices and efficiency. Explain technical concepts clearly in Khmer." 
  },
  { 
    id: "analyst", 
    name: "Analyst", 
    icon: <Brain className="w-3.5 h-3.5 text-green-400" />, 
    instruction: "You are a data-driven analyst. Focus on facts, structured breakdowns, pros and cons, and logical reasoning. Present your analysis accurately in Khmer." 
  },
  { 
    id: "minimal", 
    name: "Minimal", 
    icon: <ZapOff className="w-3.5 h-3.5 text-orange-400" />, 
    instruction: "You are a minimalist assistant. Be extremely concise. Use as few words as possible while remaining helpful. Keep it brief in Khmer." 
  }
];
import type { Chat } from "@google/genai";
import { cn } from "./lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // Changed to string for easier serialization
  attachments?: { name: string; type: string; content: string }[];
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: string;
  systemPrompt?: string;
  summary?: string;
}

import { auth, googleProvider } from "./lib/firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { useAuth } from "./components/AuthProvider";
import { LogIn, LogOut } from "lucide-react";

export default function App() {
  const { user, loading: authLoading } = useAuth();
  
  const initLanguage = (localStorage.getItem("kaud_language") as Language) || "km";
  
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem("kaud_sessions");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
    return [
      {
        id: "default",
        title: translations[initLanguage].newSession,
        messages: [],
        lastUpdated: new Date().toISOString(),
      },
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(sessions[0]?.id || "default");
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [theme, setTheme] = useState<string>(() => {
    return localStorage.getItem("kaud_theme") || "light";
  });
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem("kaud_language") as Language) || "km";
  });
  const t = translations[language];
  const [selectedPersona, setSelectedPersona] = useState(PERSONAS[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveAudioOpen, setIsLiveAudioOpen] = useState(false);
  const [isLiveVideoOpen, setIsLiveVideoOpen] = useState(false);
  const [isVisionOpen, setIsVisionOpen] = useState(false);

    // Vision Mode Component
    const VisionModeView = () => {
      const videoRef = useRef<HTMLVideoElement>(null);
      const [stream, setStream] = useState<MediaStream | null>(null);
      const [isAnalyzing, setIsAnalyzing] = useState(false);
      const [visionResult, setVisionResult] = useState("");
      const [error, setError] = useState("");
      const [isLiveActive, setIsLiveActive] = useState(false);
      const [liveStatus, setLiveStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
      const [audioLevel, setAudioLevel] = useState(0);
      const [showFullHistory, setShowFullHistory] = useState(false);
      
      const liveSessionRef = useRef<any>(null);
      const audioContextRef = useRef<AudioContext | null>(null);
      const audioInputProcessorRef = useRef<ScriptProcessorNode | null>(null);
      const resultsEndRef = useRef<HTMLDivElement>(null);

      // Auto-scroll transcription
      useEffect(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, [visionResult]);

      const startCamera = async () => {
        try {
          const mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: true 
          });
          setStream(mediaStream);
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
          setError("");
        } catch (err) {
          console.error("Camera access error:", err);
          setError(t.cameraPermissionDenied || "Camera permission denied.");
        }
      };

      const stopCamera = () => {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
        }
        stopLiveSession();
      };

      const startLiveSession = async () => {
        if (liveStatus !== "disconnected") return;
        
        setLiveStatus("connecting");
        setIsLiveActive(true);
        
        try {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
          
          const sessionPromise = ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
              },
              systemInstruction: `${selectedPersona.instruction}\n\n${activeSession.systemPrompt || DEFAULT_SYSTEM_INSTRUCTION}\nYou are currently in Vision Live mode. You can hear and "see" the video frames being sent. Respond concisely and helpfully in Khmer. If the user points the camera at something, describe it proactively.`,
            },
            callbacks: {
              onopen: () => {
                setLiveStatus("connected");
                startAudioInput(sessionPromise);
                startVideoStreaming(sessionPromise);
              },
              onmessage: async (message: LiveServerMessage) => {
                // Audio output
                const audioData = message.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
                if (audioData) {
                  playOutputAudio(audioData);
                }

                // Transcription
                const modelTranscription = message.serverContent?.modelTurn?.parts?.find(p => p.text)?.text;
                if (modelTranscription) {
                  setVisionResult(prev => prev + (prev ? "\n\n" : "") + modelTranscription);
                }
              },
              onclose: () => {
                setLiveStatus("disconnected");
                setIsLiveActive(false);
              },
              onerror: (err) => {
                console.error("Live session error:", err);
                setLiveStatus("disconnected");
                setIsLiveActive(false);
              }
            }
          });

          liveSessionRef.current = await sessionPromise;
        } catch (err) {
          console.error("Failed to connect live:", err);
          setLiveStatus("disconnected");
          setIsLiveActive(false);
        }
      };

      const stopLiveSession = () => {
        if (liveSessionRef.current) {
          liveSessionRef.current.close();
          liveSessionRef.current = null;
        }
        if (audioInputProcessorRef.current) {
          audioInputProcessorRef.current.disconnect();
          audioInputProcessorRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        setLiveStatus("disconnected");
        setIsLiveActive(false);
        setAudioLevel(0);
      };

      const startAudioInput = (sessionPromise: Promise<any>) => {
        if (!stream || !audioContextRef.current) return;
        
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
          if (liveStatus === "connected") {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Simple audio level detection
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
              sum += inputData[i] * inputData[i];
            }
            setAudioLevel(Math.sqrt(sum / inputData.length));

            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            // Base64 encoding
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
            sessionPromise.then((session) => {
              if (session) {
                session.sendRealtimeInput({
                  audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                });
              }
            }).catch(err => console.error("Error sending audio input:", err));
          }
        };
        
        source.connect(processor);
        processor.connect(audioContextRef.current.destination);
        audioInputProcessorRef.current = processor;
      };

      const startVideoStreaming = (sessionPromise: Promise<any>) => {
        const intervalId = setInterval(() => {
          if (liveStatus === "connected" && videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = 480; 
            canvas.height = (videoRef.current.videoHeight / videoRef.current.videoWidth) * 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
              sessionPromise.then((session) => {
                if (session) {
                  session.sendRealtimeInput({
                    video: { data: base64Data, mimeType: 'image/jpeg' }
                  });
                }
              }).catch(err => console.error("Error sending video frame:", err));
            }
          } else {
            clearInterval(intervalId);
          }
        }, 800); // 1.25 fps
      };

      const playOutputAudio = (base64Data: string) => {
        if (!audioContextRef.current) return;
        
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const pcmData = new Int16Array(bytes.buffer);
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 0x7FFF;
        }
        
        const buffer = audioContextRef.current.createBuffer(1, floatData.length, 16000);
        buffer.copyToChannel(floatData, 0);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start();
      };

    const handleAnalyze = async () => {
      if (!videoRef.current || isAnalyzing) return;
      
      setIsAnalyzing(true);
      
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          
          // Use chatInstanceRef directly
          if (!chatInstanceRef.current) {
            const combinedSystemPrompt = `${selectedPersona.instruction}\n\n${activeSession.systemPrompt || DEFAULT_SYSTEM_INSTRUCTION}`;
            chatInstanceRef.current = createChat(selectedModelId, combinedSystemPrompt);
          }

          const result = await chatInstanceRef.current?.sendMessage({
            message: [
              { text: "Analyze this image and describe what you see in detail. Keep it helpful and conversational in Khmer." },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image
                }
              }
            ]
          });
          
          if (result) {
            setVisionResult(prev => prev + (prev ? "\n\n---\n\n" : "") + result.text);
          }
        }
      } catch (err) {
        console.error("Analysis error:", err);
        setVisionResult(prev => prev + "\n[Error analyzing image]");
      } finally {
        setIsAnalyzing(false);
      }
    };

    useEffect(() => {
      startCamera();
      return () => stopCamera();
    }, []);

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-brand-bg flex flex-col"
      >
        <div className="h-16 shrink-0 border-b border-brand-border bg-brand-sidebar/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 z-[160]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsVisionOpen(false)}
              className="p-2 hover:bg-brand-bg rounded-xl transition-all"
            >
              <X className="w-5 h-5 text-brand-muted" />
            </button>
            <div className="flex flex-col">
              <h2 className="text-sm font-black text-brand-text flex items-center gap-2 leading-tight uppercase tracking-tighter">
                <Camera className="w-4 h-4 text-[#FF6321]" />
                {t.visionAssistant}
              </h2>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  liveStatus === "connected" ? "bg-green-500 animate-pulse" : "bg-red-500"
                )} />
                <p className="text-[10px] text-brand-muted font-bold uppercase tracking-widest">{liveStatus}</p>
              </div>
            </div>
          </div>
          
          {/* Audio Viz */}
          {isLiveActive && liveStatus === "connected" && (
            <div className="hidden md:flex items-center gap-1">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: [4, 4 + (audioLevel * 100), 4],
                  }}
                  transition={{ 
                    duration: 0.2, 
                    repeat: Infinity,
                    delay: i * 0.05
                  }}
                  className="w-1 bg-[#FF6321] rounded-full"
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col lg:flex-row p-4 lg:p-8 gap-6 overflow-hidden">
          {/* Camera Viewport */}
          <div className="flex-1 relative bg-brand-sidebar rounded-[2rem] border border-brand-border shadow-2xl overflow-hidden flex items-center justify-center min-h-[30vh]">
            {error ? (
              <div className="flex flex-col items-center gap-4 text-center p-8">
                <ZapOff className="w-12 h-12 text-red-500 opacity-50" />
                <p className="text-sm text-brand-muted max-w-xs font-bold leading-relaxed">{error}</p>
                <button onClick={startCamera} className="px-8 py-3 bg-[#FF6321] text-white rounded-2xl font-black shadow-lg hover:shadow-xl transition-all active:scale-95">{t.retry}</button>
              </div>
            ) : (
              <div className="relative w-full h-full">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={cn("w-full h-full object-cover", isAnalyzing ? "opacity-40 grayscale" : "transition-all duration-700")}
                />
                
                {/* Scanning Effect Overlay */}
                {isLiveActive && (
                  <motion.div 
                    initial={{ top: "0%" }}
                    animate={{ top: "100%" }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-x-0 h-0.5 bg-[#FF6321]/30 shadow-[0_0_15px_#FF6321] z-10 pointer-events-none"
                  />
                )}
                
                <div className="absolute inset-0 border-[20px] border-brand-sidebar/0 pointer-events-none" />
              </div>
            )}
            
            {/* HUD Overlay */}
            {!error && stream && (
              <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-6 z-20">
                <div className="flex items-center gap-3 bg-black/60 backdrop-blur-xl px-5 py-3 rounded-full border border-white/20 shadow-2xl">
                  {/* Live Audio Control */}
                  <div className="flex items-center gap-3 pr-4 border-r border-white/10">
                    <button 
                      onClick={isLiveActive ? stopLiveSession : startLiveSession}
                      className={cn(
                        "flex items-center gap-2.5 px-4 py-2 rounded-full transition-all text-[11px] font-black uppercase tracking-tighter",
                        isLiveActive ? "bg-red-500/30 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] border border-red-500/20" : "bg-white/10 text-white hover:bg-white/20 border border-white/5"
                      )}
                    >
                      <Mic className={cn("w-4 h-4", isLiveActive ? "animate-pulse" : "")} />
                      {liveStatus === "connecting" ? t.connecting : isLiveActive ? t.stopLive : t.startLive}
                    </button>
                    {isLiveActive && (
                      <div className="flex flex-col gap-0.5">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className={cn(
                      "group relative w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg ml-1",
                      isAnalyzing ? "bg-white/10 cursor-not-allowed" : "bg-[#FF6321] hover:bg-[#E5591D]"
                    )}
                  >
                    {isAnalyzing ? (
                      <RotateCcw className="w-7 h-7 text-white animate-spin" />
                    ) : (
                      <div className="w-10 h-10 rounded-full border-[3px] border-white group-hover:scale-105 transition-transform" />
                    )}
                    <span className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-black uppercase tracking-tighter">
                      {t.analyzeObject}
                    </span>
                  </button>
                </div>
              </div>
            )}
            
            {isAnalyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center animate-pulse z-30 bg-brand-sidebar/40 backdrop-blur-sm">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-[#FF6321] border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_40px_rgba(255,99,33,0.5)]" />
                  <Bot className="absolute inset-0 m-auto w-10 h-10 text-[#FF6321] animate-bounce" />
                </div>
                <p className="text-brand-text font-black text-[10px] tracking-[0.3em] bg-white dark:bg-black px-8 py-3 rounded-full shadow-2xl border border-brand-border uppercase">
                  {t.analyzing}
                </p>
              </div>
            )}
          </div>

          {/* Analysis Result Box */}
          <div className="w-full lg:w-[450px] flex flex-col gap-4 h-[55vh] lg:h-full">
            <div className="flex-1 bg-brand-sidebar border border-brand-border rounded-[2.5rem] p-6 shadow-2xl flex flex-col min-h-0 overflow-hidden relative">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#FF6321]/10 flex items-center justify-center border border-[#FF6321]/20">
                    <Bot className="w-5 h-5 text-[#FF6321]" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm tracking-tight opacity-90 uppercase tracking-tighter">{t.visionAssistant}</h3>
                    <p className="text-[10px] text-brand-muted font-bold uppercase tracking-widest">{isLiveActive ? "Streaming Live" : (showFullHistory ? "Full History" : "Snapshot Mode")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowFullHistory(!showFullHistory)}
                    className={cn(
                      "p-2.5 rounded-xl transition-all border shadow-sm flex items-center gap-1.5",
                      showFullHistory ? "bg-[#FF6321] text-white border-[#FF6321]" : "hover:bg-brand-bg text-brand-muted border-brand-border"
                    )}
                    title={t.chatHistory}
                  >
                    <History className="w-4 h-4" />
                    {showFullHistory && <span className="text-[10px] font-black uppercase tracking-tighter hidden md:inline">Back</span>}
                  </button>
                  <button 
                    onClick={() => setVisionResult("")}
                    className="p-2.5 hover:bg-brand-bg rounded-xl transition-all text-brand-muted border border-brand-border shadow-sm"
                    title="Clear"
                  >
                    <ZapOff className="w-4 h-4" />
                  </button>
                  {visionResult && (
                    <button 
                      onClick={() => handleCopy(visionResult, 'vision')}
                      className="p-2.5 hover:bg-brand-bg rounded-xl transition-all text-brand-muted border border-brand-border shadow-sm"
                      title={t.copyCode}
                    >
                      {copiedId === 'vision' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar text-base md:text-lg leading-relaxed text-brand-text font-medium relative">
                {showFullHistory ? (
                  <div className="space-y-6 pb-20">
                    {activeSession.messages.map((msg, idx) => (
                      <div key={idx} className={cn(
                        "flex flex-col gap-2 p-4 rounded-2xl border",
                        msg.role === "user" ? "bg-brand-bg border-brand-border items-end" : "bg-[#FF6321]/5 border-[#FF6321]/10 items-start"
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          {msg.role === "assistant" ? <Bot className="w-3.5 h-3.5 text-[#FF6321]" /> : <UserIcon className="w-3.5 h-3.5 text-brand-muted" />}
                          <span className="text-[9px] font-black uppercase opacity-60 tracking-widest">{msg.role}</span>
                        </div>
                        <div className="prose prose-xs md:prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                    <div ref={resultsEndRef} />
                  </div>
                ) : (
                  visionResult ? (
                    <div className="prose prose-sm md:prose-base prose-stone dark:prose-invert max-w-none space-y-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{visionResult}</ReactMarkdown>
                      <div ref={resultsEndRef} />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20">
                      <div className="w-20 h-20 rounded-full bg-[#FF6321]/5 flex items-center justify-center mb-6 animate-pulse">
                        <Sparkles className="w-10 h-10 text-[#FF6321]" />
                      </div>
                      <p className="text-sm font-black px-10 leading-snug opacity-40 uppercase tracking-tighter">{t.visionDesc}</p>
                    </div>
                  )
                )}
              </div>
              
              {!isLiveActive && (
                <div className="absolute bottom-6 left-6 right-6">
                   <div className="bg-[#FF6321]/5 border border-[#FF6321]/10 rounded-[1.5rem] p-4 flex items-center gap-3 shadow-sm backdrop-blur-md">
                    <div className="w-9 h-9 rounded-2xl bg-[#FF6321]/10 flex items-center justify-center shrink-0 border border-[#FF6321]/20">
                      <Zap className="w-4 h-4 text-[#FF6321]" />
                    </div>
                    <p className="text-[10px] md:text-xs text-[#FF6321] font-bold leading-tight opacity-70">
                      Tip: {t.visionDesc}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [tempSystemPrompt, setTempSystemPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(() => {
    return localStorage.getItem("kaud_model") || "gemini-3-flash-preview";
  });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; type: string; content: string }[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInstanceRef = useRef<Chat | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setIsQuickActionsOpen(false);
      }
    };

    if (isQuickActionsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isQuickActionsOpen]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const filteredSessions = sessions.filter(session => {
    const sessionMatches = session.title.toLowerCase().includes(searchQuery.toLowerCase());
    const messageMatches = session.messages.some(m => 
      m.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return sessionMatches || messageMatches;
  });

  // Initialize or update chat instance when active session or its system prompt changes
  useEffect(() => {
    const history = activeSession.messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    
    const combinedSystemPrompt = `${selectedPersona.instruction}\n\n${activeSession.systemPrompt || DEFAULT_SYSTEM_INSTRUCTION}`;
    chatInstanceRef.current = createChat(selectedModelId, combinedSystemPrompt, history);
  }, [activeSessionId, activeSession.systemPrompt, selectedPersona, selectedModelId]);

  useEffect(() => {
    localStorage.setItem("kaud_model", selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    localStorage.setItem("kaud_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem("kaud_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("kaud_language", language);
  }, [language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isLoading]);

  const createNewSession = () => {
    const newSession: Session = {
      id: Date.now().toString(),
      title: t.newSession,
      messages: [],
      lastUpdated: new Date().toISOString(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (id === activeSessionId) {
        if (filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else {
          // If all deleted, create a new one
          const newSession: Session = {
            id: Date.now().toString(),
            title: t.newSession,
            messages: [],
            lastUpdated: new Date().toISOString(),
          };
          setActiveSessionId(newSession.id);
          return [newSession];
        }
      }
      return filtered;
    });
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsProfileOpen(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t.browserNoVoice);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'km-KH'; // Cambodian/Khmer
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map(result => result.transcript)
        .join('');
      
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleSend = async () => {
    if (!input.trim() && uploadedFiles.length === 0) return;
    if (isLoading) return;

    const sanitizedInput = input.trim().replace(/<[^>]*>?/gm, ''); // Basic sanitization

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: sanitizedInput,
      timestamp: new Date().toISOString(),
      attachments: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
    };

    setSessions((prev) => 
      prev.map((s) => {
        if (s.id === activeSessionId) {
          const isFirstMessage = s.messages.length <= 1;
          const newTitle = isFirstMessage ? (sanitizedInput.length > 30 ? sanitizedInput.substring(0, 30) + "..." : sanitizedInput) : s.title;
          return {
            ...s,
            title: newTitle || t.newSession,
            messages: [...s.messages, userMessage],
            lastUpdated: new Date().toISOString(),
          };
        }
        return s;
      })
    );

    setInput("");
    setUploadedFiles([]);
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      if (!chatInstanceRef.current) {
        const combinedSystemPrompt = `${selectedPersona.instruction}\n\n${activeSession.systemPrompt || DEFAULT_SYSTEM_INSTRUCTION}`;
        chatInstanceRef.current = createChat(selectedModelId, combinedSystemPrompt);
      }
      
      const parts: any[] = [{ text: sanitizedInput }];
      
      uploadedFiles.forEach(file => {
        if (file.type.includes('image') || file.type.includes('video') || file.type.includes('audio') || file.type.includes('pdf')) {
          const base64Data = file.content.split(',')[1] || file.content;
          parts.push({
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          });
        }
      });

      const result = await chatInstanceRef.current.sendMessage({ message: parts });
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.text || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date().toISOString(),
      };
      
      setSessions((prev) => 
        prev.map((s) => 
          s.id === activeSessionId 
            ? { ...s, messages: [...s.messages, assistantMessage], lastUpdated: new Date().toISOString() } 
            : s
        )
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Generation aborted');
      } else {
        console.error("Error sending message:", error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "I encountered an error while processing your request. Please check your connection and try again.",
          timestamp: new Date().toISOString(),
        };
        setSessions((prev) => 
          prev.map((s) => 
            s.id === activeSessionId 
              ? { ...s, messages: [...s.messages, errorMessage], lastUpdated: new Date().toISOString() } 
              : s
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      
      // Since @google/genai might not support AbortSignal directly in all environments yet,
      // we at least stop UI loading and clear ref. 
      // Most cloud SDKs don't have perfect cancel, but we simulate it for UX.
      const stopMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "_[Generation stopped by user]_",
        timestamp: new Date().toISOString(),
      };
      
      setSessions((prev) => 
        prev.map((s) => 
          s.id === activeSessionId 
            ? { ...s, messages: [...s.messages, stopMessage], lastUpdated: new Date().toISOString() } 
            : s
        )
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      // Small simulation of file reading
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          type: file.type || "unknown",
          content: event.target?.result as string
        }]);
      };
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.js') || file.name.endsWith('.ts')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file); // For images/videos
      }
    });
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRename = (session: Session) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const saveRename = () => {
    if (!editingSessionId) return;
    setSessions(prev => prev.map(s => 
      s.id === editingSessionId ? { ...s, title: editingTitle.trim() || s.title } : s
    ));
    setEditingSessionId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUpdateSystemPrompt = () => {
    setSessions(prev => prev.map(s => 
      s.id === activeSessionId ? { ...s, systemPrompt: tempSystemPrompt } : s
    ));
    setIsSettingsOpen(false);
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteMessage = (id: string) => {
    setSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, messages: s.messages.filter(m => m.id !== id) } 
        : s
    ));
  };

  const handleRestoreMessage = (msg: Message) => {
    if (msg.role === "user") {
      setInput(msg.content);
      if (msg.attachments) {
        setUploadedFiles(msg.attachments);
      }
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else {
      // Regenerate: Remove this assistant message and trigger handleSend with the last user message
      const sessionMessages = activeSession.messages;
      const lastUserMsgIndex = [...sessionMessages].reverse().findIndex(m => m.role === "user");
      
      if (lastUserMsgIndex !== -1) {
        const actualIndex = sessionMessages.length - 1 - lastUserMsgIndex;
        const lastUserMsg = sessionMessages[actualIndex];
        
        // Remove assistant message and everything after it
        const messageIndex = sessionMessages.findIndex(m => m.id === msg.id);
        const filteredMessages = sessionMessages.slice(0, messageIndex);
        
        setSessions(prev => prev.map(s => 
          s.id === activeSessionId ? { ...s, messages: filteredMessages } : s
        ));
        
        // Restore content and attachments
        setInput(lastUserMsg.content);
        if (lastUserMsg.attachments) {
          setUploadedFiles(lastUserMsg.attachments);
        }

        // Trigger send after a brief delay to allow state update or just call handleSend directly
        // But handleSend uses state, so we might need a version that takes arguments
        setTimeout(() => {
          handleSend();
        }, 100);
      }
    }
  };

  const handleSendWithContent = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content,
      timestamp: new Date().toISOString(),
    };

    setSessions((prev) => 
      prev.map((s) => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: [...s.messages, userMessage],
            lastUpdated: new Date().toISOString(),
          };
        }
        return s;
      })
    );

    setInput("");
    setIsLoading(true);

    try {
      if (!chatInstanceRef.current) {
        chatInstanceRef.current = createChat(selectedModelId, selectedPersona.instruction + "\n\n" + (activeSession.systemPrompt || DEFAULT_SYSTEM_INSTRUCTION));
      }
      
      const result = await chatInstanceRef.current.sendMessage({ message: content });
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.text || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date().toISOString(),
      };
      
      setSessions((prev) => 
        prev.map((s) => 
          s.id === activeSessionId 
            ? { ...s, messages: [...s.messages, assistantMessage], lastUpdated: new Date().toISOString() } 
            : s
        )
      );
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (activeSession.messages.length < 2 || isSummarizing) return;
    
    setIsSummarizing(true);
    try {
      const summary = await summarizeMessages(activeSession.messages, selectedModelId);
      setSessions(prev => prev.map(s => 
        s.id === activeSessionId ? { ...s, summary } : s
      ));
    } catch (error) {
      console.error("Summary error:", error);
    } finally {
      setIsSummarizing(false);
    }
  };

  const MarkdownComponents: any = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const [localCopied, setLocalCopied] = useState(false);

      const handleCopyCode = () => {
        navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
        setLocalCopied(true);
        setTimeout(() => setLocalCopied(false), 2000);
      };

      if (!inline && match) {
        return (
          <div className="relative group/code my-6 overflow-hidden rounded-xl border border-brand-border bg-brand-bg shadow-sm">
            <div className="flex items-center justify-between px-4 py-2 bg-brand-border/20 border-b border-brand-border">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-brand-muted" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-muted">{match[1]}</span>
              </div>
              <button 
                onClick={handleCopyCode}
                className="p-1 px-2 hover:bg-brand-bg rounded-md transition-all text-brand-muted hover:text-brand-text flex items-center gap-2"
              >
                <span className="text-[9px] font-mono uppercase tracking-tighter">{localCopied ? "Copied" : "Copy"}</span>
                {localCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="p-1">
              <SyntaxHighlighter
                style={theme === 'light' ? vs : vscDarkPlus}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: '1.25rem',
                  fontSize: '0.75rem',
                  backgroundColor: 'transparent',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
                {...props}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            </div>
          </div>
        );
      }

      return (
        <code className={cn("px-1.5 py-0.5 rounded bg-brand-border/30 font-mono text-[0.8em] font-bold text-[#FF6321]", className)} {...props}>
          {children}
        </code>
      );
    },
    h1: ({ children }: any) => <h1 className="text-xl font-black uppercase tracking-tight border-l-4 border-[#FF6321] pl-3 my-6">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-black uppercase tracking-tight my-5 flex items-center gap-2"><div className="w-2 h-2 bg-[#FF6321] rotate-45" /> {children}</h2>,
    h3: ({ children }: any) => <h3 className="text-base font-black uppercase tracking-tight my-4 text-brand-muted">{children}</h3>,
    p: ({ children }: any) => <p className="mb-4 leading-relaxed last:mb-0">{children}</p>,
    ul: ({ children }: any) => <ul className="space-y-2 mb-6 list-none">{children}</ul>,
    ol: ({ children }: any) => <ol className="space-y-2 mb-6 list-decimal pl-4">{children}</ol>,
    li: ({ children, ...props }: any) => {
      const isListItem = props.className?.includes('list-none'); // Check if it's inside our custom UL
      return (
        <li className="flex gap-2">
          {!props.ordered && <span className="text-[#FF6321] mt-1.5">●</span>}
          <span>{children}</span>
        </li>
      );
    },
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-brand-border bg-brand-bg/50 p-4 rounded-r-xl italic my-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-2 opacity-5">
          <Quote className="w-12 h-12" />
        </div>
        {children}
      </blockquote>
    ),
    table: ({ children }: any) => (
      <div className="my-6 overflow-x-auto rounded-xl border border-brand-border">
        <table className="w-full text-left border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => <thead className="bg-brand-border/20 border-b border-brand-border">{children}</thead>,
    th: ({ children }: any) => <th className="p-3 text-[10px] font-mono font-black uppercase tracking-widest text-brand-muted">{children}</th>,
    td: ({ children }: any) => <td className="p-3 text-sm border-b border-brand-border/50 last:border-b-0">{children}</td>,
  };

  return (
    <div className="flex h-screen bg-brand-bg text-brand-text font-sans overflow-hidden">
      {/* Sidebar */}
      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ x: -300, width: 0, opacity: 0 }}
            animate={{ x: 0, width: 288, opacity: 1 }}
            exit={{ x: -300, width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 z-50 bg-brand-sidebar border-r border-brand-border flex flex-col lg:relative shadow-xl overflow-hidden"
          >
            <div className="p-4 flex items-center justify-between border-b border-brand-border bg-brand-sidebar shrink-0">
              <div className="flex items-center gap-2 font-semibold text-lg text-brand-text truncate">
                <Command className="w-5 h-5 text-[#FF6321] shrink-0" />
                <span className="truncate">KauD Assistant</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 hover:bg-brand-bg rounded-lg text-brand-text transition-all border border-brand-border shadow-sm bg-brand-bg active:scale-95 flex items-center justify-center"
                title={t.closeSidebar}
              >
                <X className="w-4 h-4 opacity-80" />
              </button>
            </div>

            <div className="p-4 border-b border-brand-border bg-brand-sidebar">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-brand-bg border border-brand-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#FF6321] text-brand-text"
                />
              </div>
            </div>

            <div className="p-4 bg-brand-sidebar">
              <button 
                onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1C1917] dark:bg-white dark:text-black text-white rounded-xl hover:opacity-90 transition-opacity font-medium"
              >
                <Plus className="w-4 h-4" />
                {t.newChat}
              </button>
              
              {/* Model Select Integrated in Sidebar */}
              <div className="flex items-center gap-2 px-3 py-2 bg-brand-bg rounded-xl border border-brand-border shadow-sm mt-2">
                <Terminal className="w-4 h-4 text-[#FF6321] shrink-0" />
                <select 
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="bg-transparent text-[11px] font-bold uppercase tracking-widest outline-none cursor-pointer text-brand-text hover:text-[#FF6321] w-full"
                >
                  {AVAILABLE_MODELS.map(model => (
                    <option key={model.id} value={model.id} className="bg-brand-sidebar text-brand-text">
                      {model.name.replace('Gemini ', '').replace('2.0 ', '').replace('1.5 ', '')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1 bg-brand-sidebar">
              {/* Live Modes Section */}
              <div className="px-3 mb-6 space-y-2">
                <h3 className="px-3 text-[10px] font-mono font-black text-brand-muted uppercase tracking-[0.2em] mb-2 text-center md:text-left">Live_Multimodal</h3>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => setIsLiveAudioOpen(true)}
                    className="flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase font-bold tracking-widest bg-brand-bg border border-brand-border rounded-xl text-brand-text hover:border-[#FF6321] transition-all group shadow-sm"
                  >
                    <div className="p-1.5 bg-[#FF6321]/10 rounded-lg group-hover:scale-110 transition-transform">
                      <Mic className="w-3.5 h-3.5 text-[#FF6321]" />
                    </div>
                    {t.liveAudio}
                  </button>
                  <button 
                    onClick={() => setIsLiveVideoOpen(true)}
                    className="flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase font-bold tracking-widest bg-brand-bg border border-brand-border rounded-xl text-brand-text hover:border-[#FF6321] transition-all group shadow-sm"
                  >
                    <div className="p-1.5 bg-[#FF6321]/10 rounded-lg group-hover:scale-110 transition-transform">
                      <VideoIcon className="w-3.5 h-3.5 text-[#FF6321]" />
                    </div>
                    {t.liveVideo}
                  </button>
                </div>
              </div>

              <div className="px-3 mb-2 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                {t.history}
              </div>
              {filteredSessions.map((session) => (
                <div key={session.id} className="group relative">
                  {editingSessionId === session.id ? (
                    <div className="flex items-center gap-2 px-3 py-1 bg-brand-bg rounded-lg mx-1 border border-[#FF6321]">
                      <input 
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                        autoFocus
                        className="bg-transparent text-xs w-full focus:outline-none"
                      />
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        setActiveSessionId(session.id);
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                      onDoubleClick={() => startRename(session)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left group",
                        activeSessionId === session.id 
                          ? "bg-brand-bg text-brand-text font-medium" 
                          : "text-brand-muted hover:bg-brand-bg hover:text-brand-text"
                      )}
                    >
                      <History className={cn(
                        "w-4 h-4 shrink-0",
                        activeSessionId === session.id ? "text-[#FF6321]" : "opacity-60"
                      )} />
                      <span className="truncate flex-1 pr-12">{session.title}</span>
                    </button>
                  )}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => startRename(session)}
                      className="p-1.5 hover:bg-brand-bg text-brand-muted hover:text-brand-text rounded-md"
                      title="Rename"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="p-1.5 hover:bg-red-500/10 hover:text-red-500 text-brand-muted transition-all rounded-md"
                      title="Delete session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {filteredSessions.length === 0 && (
                <div className="px-3 py-4 text-xs text-brand-muted text-center italic">
                  {t.noHistory}
                </div>
              )}
            </nav>

            <div className="p-4 border-t border-brand-border space-y-1 bg-brand-sidebar text-brand-text">
              <button 
                onClick={() => {
                  setIsVisionOpen(true);
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#FF6321] hover:bg-[#FF6321]/10 rounded-lg transition-colors font-bold"
                title={t.visionMode}
              >
                <Camera className="w-4 h-4 shrink-0" />
                {t.visionMode}
              </button>
              <button 
                onClick={() => {
                  setTempSystemPrompt(activeSession.systemPrompt || DEFAULT_SYSTEM_INSTRUCTION);
                  setIsSettingsOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#44403C] hover:bg-[#F5F5F4] dark:hover:bg-brand-bg rounded-lg transition-colors"
                title={t.generalSettings}
              >
                <Settings className="w-4 h-4 opacity-60" />
                {t.generalSettings}
              </button>
              <button 
                onClick={() => setIsAboutOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#44403C] hover:bg-[#F5F5F4] dark:hover:bg-brand-bg rounded-lg transition-colors"
                title={t.aboutKauda}
              >
                <Info className="w-4 h-4 opacity-60" />
                {t.aboutKauda}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 bg-brand-bg text-brand-text">
        {/* Header */}
        <header className="h-16 border-b border-brand-border bg-brand-sidebar/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4 text-brand-text">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-brand-sidebar bg-brand-bg border border-brand-border rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center group"
                title={t.openSidebar}
              >
                <Menu className="w-5 h-5 text-brand-text opacity-80 group-hover:opacity-100" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <h1 className="font-semibold text-sm lg:text-base">{t.currentSession}</h1>
                <p className="text-[10px] lg:text-xs text-brand-muted flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#FF6321]" />
                  {t.partnerDesc}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSummarize}
              disabled={isSummarizing || activeSession.messages.length < 2}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                isSummarizing ? "animate-pulse" : "",
                activeSession.messages.length < 2 
                  ? "text-[#A8A29E] bg-[#E7E5E4] cursor-not-allowed" 
                  : "text-brand-text bg-brand-bg hover:bg-brand-border border border-brand-border"
              )}
            >
              <Zap className="w-3.5 h-3.5 text-[#FF6321]" />
              {isSummarizing ? t.summarizing : t.summarize}
            </button>
            
            {user ? (
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="w-8 h-8 rounded-full border-2 border-[#FF6321] overflow-hidden hover:scale-105 transition-transform active:scale-95 shadow-sm"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-[#FF6321] flex items-center justify-center text-white text-xs font-bold">
                    {user.displayName?.substring(0, 2).toUpperCase() || 'U'}
                  </div>
                )}
              </button>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#FF6321] text-white rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-md"
              >
                <LogIn className="w-4 h-4" />
                ចូលប្រើ
              </button>
            )}
          </div>
        </header>

        {activeSession.summary && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="px-4 lg:px-8 bg-[#FFF7ED] border-b border-[#FFEDD5]"
          >
            <div className="max-w-3xl mx-auto py-3 text-xs flex gap-3 items-start">
              <div className="mt-0.5 p-1 bg-[#FFEDD5] rounded text-[#EA580C]">
                <Info className="w-3 h-3" />
              </div>
              <div className="flex-1 text-[#9A3412] leading-relaxed">
                <span className="font-bold mr-1 uppercase text-[10px] tracking-wider">{t.sessionSummary}</span>
                {activeSession.summary}
              </div>
              <button 
                onClick={() => setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, summary: "" } : s))}
                className="p-1 hover:bg-[#FFEDD5] rounded text-[#EA580C]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Chat Area */}
        <div className={cn(
          "overflow-y-auto p-4 lg:p-8 scroll-smooth flex flex-col",
          activeSession.messages.length === 0 ? "flex-1 items-center justify-center p-0" : "flex-1 space-y-6"
        )}>
          <div className={cn(
            "max-w-3xl mx-auto w-full",
            activeSession.messages.length === 0 ? "flex flex-col items-center justify-center flex-1 h-full min-h-0" : "space-y-8"
          )}>
            {activeSession.messages.length === 0 ? (
              <div className="w-full flex justify-center flex-col items-center text-center pb-8 lg:pb-12 mt-auto">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="mb-10"
                >
                  <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-brand-text mb-3">
                    {user ? `${t.greetingUser}${user.displayName?.split(' ')[0] || user.email?.split('@')[0]}!` : `${t.greeting}!`}
                  </h2>
                  <p className="text-lg md:text-xl font-medium text-brand-muted">
                    {t.howCanIHelp} <span className="text-[#FF6321]">{t.today}</span>
                  </p>
                </motion.div>

                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl px-4"
                >
                  {[
                    { title: t.feature1Desc, prompt: t.feature1Desc, icon: <Terminal className="w-4 h-4" /> },
                    { title: t.feature2Desc, prompt: t.feature2Desc, icon: <Zap className="w-4 h-4" /> },
                    { title: t.feature3Desc, prompt: t.feature3Desc, icon: <ImageIcon className="w-4 h-4" /> },
                    { title: t.feature4Desc, prompt: t.feature4Desc, icon: <Layers className="w-4 h-4" /> }
                  ].map((feature, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendWithContent(feature.prompt)}
                      className="group flex items-center gap-3 p-4 bg-white dark:bg-brand-sidebar border border-transparent hover:border-[#FF6321]/30 rounded-2xl text-left transition-all active:scale-95 shadow-sm hover:shadow-md"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#FF6321]/10 flex items-center justify-center text-[#FF6321] group-hover:scale-110 transition-transform">
                        {feature.icon}
                      </div>
                      <span className="text-sm font-semibold text-brand-text leading-tight">{feature.title}</span>
                    </button>
                  ))}
                </motion.div>
              </div>
            ) : (
              activeSession.messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-4 group",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1",
                  msg.role === "assistant" ? "bg-[#FF6321] text-white" : "bg-[#E7E5E4] text-[#44403C]"
                )}>
                  {msg.role === "assistant" ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className={cn(
                  "max-w-[85%] lg:max-w-[75%] space-y-1 relative",
                  msg.role === "user" ? "items-end text-right" : "items-start text-left"
                )}>
                  <div className={cn(
                    "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm font-medium border relative bg-brand-sidebar border-brand-border text-brand-text",
                    msg.role === "user" ? "rounded-tr-none" : "rounded-tl-none"
                  )}>
                    <div className="prose prose-sm max-w-none prose-stone dark:prose-invert prose-pre:bg-transparent prose-pre:p-0">
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={cn(
                          "flex flex-wrap gap-2 mb-3",
                          msg.role === "user" ? "justify-end" : "justify-start"
                        )}>
                          {msg.attachments.map((file, idx) => (
                            file.type.startsWith('image/') ? (
                              <div key={idx} className="relative group/img">
                                <img 
                                  src={file.content} 
                                  alt={file.name} 
                                  className="max-w-[200px] md:max-w-[300px] rounded-xl border border-brand-border shadow-sm hover:scale-[1.02] transition-transform cursor-pointer"
                                  referrerPolicy="no-referrer"
                                  onClick={() => window.open(file.content, '_blank')}
                                />
                              </div>
                            ) : (
                              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-brand-bg border border-brand-border text-[10px] md:text-xs">
                                <FileText className="w-3.5 h-3.5 text-[#FF6321]" />
                                <span className="truncate max-w-[100px]">{file.name}</span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      {msg.content && (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={MarkdownComponents}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className={cn(
                      "absolute -bottom-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10",
                      msg.role === "user" ? "right-0" : "left-0"
                    )}>
                      <button 
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className="p-1.5 bg-brand-sidebar border border-brand-border rounded-lg hover:bg-brand-bg text-brand-muted transition-colors"
                        title="Copy"
                      >
                        {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button 
                        onClick={() => handleRestoreMessage(msg)}
                        className="p-1.5 bg-brand-sidebar border border-brand-border rounded-lg hover:bg-brand-bg text-brand-muted transition-colors"
                        title={msg.role === "user" ? "Restore to input" : "Regenerate"}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="p-1.5 bg-brand-sidebar border border-brand-border rounded-lg hover:bg-red-500/10 hover:text-red-500 text-brand-muted transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <span className="text-[10px] text-brand-muted px-1 block mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            )))}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                <div className="w-8 h-8 rounded-lg bg-[#FF6321] flex items-center justify-center text-white">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="bg-brand-sidebar border border-brand-border px-4 py-3 rounded-2xl shadow-sm flex flex-col gap-2 min-w-[120px]">
                  <div className="flex items-center gap-1.5">
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-1.5 h-1.5 bg-[#FF6321] rounded-full" 
                    />
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                      className="w-1.5 h-1.5 bg-[#FF6321] rounded-full" 
                    />
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                      className="w-1.5 h-1.5 bg-[#FF6321] rounded-full" 
                    />
                  </div>
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="h-1 bg-[#FF6321]/20 rounded-full overflow-hidden"
                  >
                    <div className="h-full bg-[#FF6321] w-1/3" />
                  </motion.div>
                  <p className="text-[10px] text-brand-muted animate-pulse font-bold uppercase tracking-tighter">{t.thinking}</p>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className={cn(
          "transition-all",
          activeSession.messages.length === 0 
            ? "pb-8 lg:pb-12 px-4 w-full"
            : "p-4 lg:p-8 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent"
        )}>
          <div className="max-w-3xl mx-auto relative space-y-3">
            {/* File Previews */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {uploadedFiles.map((file, i) => (
                  <div key={i} className={cn(
                    "relative flex items-center gap-2 p-1 bg-brand-sidebar border border-brand-border rounded-xl text-[10px] font-bold group overflow-hidden transition-all hover:border-[#FF6321]/50 shadow-sm",
                    file.type.includes('image') ? "pl-1 pr-3 py-1" : "px-3 py-1.5"
                  )}>
                    {file.type.includes('image') ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-brand-border bg-brand-bg shrink-0">
                        <img 
                          src={file.content} 
                          alt={file.name} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      file.type.includes('video') ? <Video className="w-3 h-3 text-purple-500" /> :
                      file.type.includes('pdf') ? <FileText className="w-3 h-3 text-red-500" /> :
                      file.type.includes('code') ? <FileCode className="w-4 h-4 text-yellow-500" /> :
                      <File className="w-3 h-3 text-brand-muted" />
                    )}
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="truncate max-w-[120px] leading-tight text-brand-text">{file.name}</span>
                      <span className="text-[8px] opacity-60 uppercase tracking-tighter truncate text-brand-muted">
                        {file.type.split('/')[1]?.toUpperCase() || "FILE"}
                      </span>
                    </div>
                    <button 
                      onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-red-500/10 hover:text-red-500 rounded-md text-brand-muted opacity-0 group-hover:opacity-100 transition-all bg-brand-sidebar/90 backdrop-blur-sm border border-transparent hover:border-red-500/20 shadow-sm"
                      title={t.delete}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Persona Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar persona-selector-container">
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-muted shrink-0 mr-1">{t.personaPrefix}</span>
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPersona(p)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold transition-all border shrink-0 min-h-[32px] sm:min-h-0 touch-none",
                    selectedPersona.id === p.id 
                      ? "bg-[#FF6321] text-white border-[#FF6321] shadow-sm" 
                      : "bg-brand-sidebar border-brand-border text-brand-muted hover:bg-brand-bg"
                  )}
                >
                  {p.icon}
                  {t[getPersonaNameKey(p.id) as keyof typeof t] || p.name}
                </button>
              ))}
            </div>

            <div className="relative flex items-end gap-2 bg-brand-sidebar border border-brand-border rounded-[2rem] px-3 py-2 md:px-4 md:py-3 shadow-lg focus-within:ring-2 focus-within:ring-[#FF6321]/20 transition-all">
              {/* File input (Hidden) */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload}
                multiple
                className="hidden" 
                accept="video/*,image/*,.pdf,text/*,.js,.ts,.py,.html,.css,.json"
              />

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.sendMsg}
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 px-4 text-sm min-h-[52px] max-h-[200px] text-brand-text font-medium leading-relaxed"
                rows={1}
              />
              <div className="flex items-center gap-1 pb-1 pr-1">
                <div className="relative" ref={quickActionsRef}>
                  <button 
                    onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
                    className="p-2.5 text-brand-muted hover:bg-brand-bg hover:text-[#FF6321] rounded-xl transition-colors"
                    title={t.quickActions}
                  >
                    <Zap className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {isQuickActionsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute bottom-full left-0 mb-2 w-56 bg-brand-sidebar border border-brand-border rounded-2xl shadow-xl overflow-hidden z-[60]"
                      >
                        <div className="p-2 space-y-1">
                          <button 
                            onClick={() => { createNewSession(); setIsQuickActionsOpen(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-brand-text hover:bg-brand-bg hover:text-[#FF6321] rounded-xl transition-all text-left"
                          >
                            <Plus className="w-4 h-4" />
                            {t.newChat}
                          </button>
                          <button 
                            onClick={() => { handleSummarize(); setIsQuickActionsOpen(false); }}
                            disabled={isSummarizing || activeSession.messages.length < 2}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-brand-text hover:bg-brand-bg hover:text-[#FF6321] rounded-xl transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FileText className="w-4 h-4" />
                            {t.summarize}
                          </button>
                          <button 
                            onClick={() => { 
                              setIsQuickActionsOpen(false);
                              const elem = document.querySelector('.persona-selector-container');
                              if (elem) elem.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-brand-text hover:bg-brand-bg hover:text-[#FF6321] rounded-xl transition-all text-left"
                          >
                            <UserCircle className="w-4 h-4" />
                            {t.changePersona}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button 
                  onClick={handleVoiceInput}
                  className={cn(
                    "p-2.5 rounded-xl transition-all",
                    isListening ? "bg-red-500 text-white animate-pulse" : "text-brand-muted hover:bg-brand-bg"
                  )}
                  title={t.voiceTyping}
                >
                  <Mic className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-brand-muted hover:bg-brand-bg rounded-xl transition-colors"
                  title={t.uploadFile}
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                {isLoading ? (
                  <button
                    onClick={handleStopGeneration}
                    className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all shadow-sm"
                    title={t.stopGen}
                  >
                    <Square className="w-5 h-5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && uploadedFiles.length === 0) || isLoading}
                    className={cn(
                      "p-2.5 rounded-xl transition-all",
                      (input.trim() || uploadedFiles.length > 0) && !isLoading 
                        ? "bg-[#FF6321] text-white shadow-md hover:bg-[#E5591D]" 
                        : "bg-brand-border text-brand-muted cursor-not-allowed"
                    )}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-center mt-3 text-brand-muted">
              {t.disclaimer}
            </p>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-brand-sidebar border border-brand-border rounded-3xl shadow-2xl overflow-hidden text-brand-text flex flex-col max-h-[90vh]"
            >
              <div className="px-5 py-4 sm:px-6 border-b border-brand-border flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold">{t.generalSettings}</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-brand-bg rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
                <div className="space-y-3">
                  <label className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-brand-muted">
                    {t.language}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setLanguage('km')}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border transition-all text-xs font-bold",
                        language === 'km' 
                          ? "border-[#FF6321] bg-[#FF6321]/10 text-[#FF6321] ring-1 ring-[#FF6321]" 
                          : "border-brand-border hover:bg-brand-bg"
                      )}
                    >
                      ខ្មែរ
                    </button>
                    <button
                      onClick={() => setLanguage('en')}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border transition-all text-xs font-bold",
                        language === 'en' 
                          ? "border-[#FF6321] bg-[#FF6321]/10 text-[#FF6321] ring-1 ring-[#FF6321]" 
                          : "border-brand-border hover:bg-brand-bg"
                      )}
                    >
                      English
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-brand-muted">
                    {t.appearance}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'light', name: t.themeLight, color: 'bg-[#F5F5F4]' },
                      { id: 'dark', name: t.themeDark, color: 'bg-[#0C0A09]' },
                      { id: 'midnight', name: t.themeMidnight, color: 'bg-[#020617]' },
                      { id: 'forest', name: t.themeForest, color: 'bg-[#052e16]' }
                    ].map((themeOpt) => (
                      <button
                        key={themeOpt.id}
                        onClick={() => setTheme(themeOpt.id)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-xl border transition-all text-xs font-medium",
                          theme === themeOpt.id 
                            ? "border-[#FF6321] bg-brand-bg ring-1 ring-[#FF6321]" 
                            : "border-brand-border hover:bg-brand-bg"
                        )}
                      >
                        <div className={cn("w-4 h-4 rounded-full border border-white/20", themeOpt.color)} />
                        {themeOpt.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-brand-muted">
                    {t.sysPrompt}
                  </label>
                  <p className="text-[10px] text-brand-muted">{t.sysPromptDesc}</p>
                  <textarea
                    value={tempSystemPrompt}
                    onChange={(e) => setTempSystemPrompt(e.target.value)}
                    className="w-full h-32 p-4 text-sm bg-brand-bg border border-brand-border rounded-xl focus:ring-1 focus:ring-[#FF6321] outline-none transition-all resize-none text-brand-text"
                    placeholder={t.sysPromptPlaceholder}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg rounded-xl transition-colors"
                  >
                    {language === 'km' ? 'បោះបង់' : 'Cancel'}
                  </button>
                  <button 
                    onClick={handleUpdateSystemPrompt}
                    className="px-6 py-2 text-sm font-bold bg-[#FF6321] text-white rounded-xl hover:opacity-90 transition-all shadow-md active:scale-95"
                  >
                    {t.saveChanges}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <LiveAudio isOpen={isLiveAudioOpen} onClose={() => setIsLiveAudioOpen(false)} />
      <LiveVideo isOpen={isLiveVideoOpen} onClose={() => setIsLiveVideoOpen(false)} />

      {/* About Modal - Redesigned High-Tech Minimalist */}
      <AnimatePresence>
        {isAboutOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAboutOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="relative w-full max-w-2xl bg-white/5 border border-white/10 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden text-brand-text flex flex-col max-h-[90vh]"
            >
              <div className="p-1 overflow-y-auto flex-1">
                <div className="bg-[#0A0A0A] rounded-[2.3rem] overflow-hidden min-h-full">
                  {/* Top Bar Navigation Look */}
                  <div className="flex items-center justify-between px-6 py-5 sm:px-8 sm:py-6 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent sticky top-0 z-10 backdrop-blur-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#FF6321] flex items-center justify-center shadow-lg shadow-[#FF6321]/20">
                        <History className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                          KauD Intelligence
                          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-mono text-brand-muted">STABLE_BETA</span>
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-[10px] font-medium text-green-500/80 uppercase tracking-widest">Systems Active</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsAboutOpen(false)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-brand-muted hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-10 space-y-12">
                    {/* Mission Quote */}
                    <div className="relative">
                      <Quote className="absolute -top-6 -left-6 w-12 h-12 text-white/5" />
                      <p className="text-lg md:text-xl font-medium leading-relaxed bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                        {t.kaudMission}
                      </p>
                    </div>

                    {/* Stats Dashboard Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Compute', value: 'Nexus v4', icon: <Cpu className="w-4 h-4" /> },
                        { label: 'Latency', value: '12ms', icon: <Zap className="w-4 h-4" /> },
                        { label: 'Uptime', value: '99.9%', icon: <Activity className="w-4 h-4" /> },
                        { label: 'Security', value: 'AES-256', icon: <Shield className="w-4 h-4" /> }
                      ].map((item, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1 * i }}
                          className="group bg-white/[0.03] border border-white/5 p-4 rounded-3xl hover:bg-white/[0.06] transition-all"
                        >
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#FF6321] mb-3 group-hover:scale-110 transition-transform">
                            {item.icon}
                          </div>
                          <p className="text-[10px] text-brand-muted uppercase font-bold tracking-tighter mb-0.5">{item.label}</p>
                          <p className="text-sm font-black text-white">{item.value}</p>
                        </motion.div>
                      ))}
                    </div>

                    {/* Footer Info */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-10 border-t border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                          {[1,2,3].map(i => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0A0A0A] bg-brand-sidebar flex items-center justify-center overflow-hidden">
                              <User className="w-4 h-4 opacity-50" />
                            </div>
                          ))}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">KauD Architecture Team</p>
                          <p className="text-[10px] text-brand-muted">Crafting the future of AI</p>
                        </div>
                      </div>

                      <button 
                        onClick={() => setIsAboutOpen(false)}
                        className="px-10 py-4 bg-[#FF6321] hover:bg-white hover:text-black text-white rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-[#FF6321]/20 active:scale-95"
                      >
                        Explore OS
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Decorative Element */}
              <div className="h-2 bg-gradient-to-r from-[#FF6321]/0 via-[#FF6321]/40 to-[#FF6321]/0" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      <LiveAudio isOpen={isLiveAudioOpen} onClose={() => setIsLiveAudioOpen(false)} />
      <LiveVideo isOpen={isLiveVideoOpen} onClose={() => setIsLiveVideoOpen(false)} />

      {/* Profile Modal - Redesigned Cyber-Luxe Glassmorphism */}
      <AnimatePresence>
        {isProfileOpen && user && (
          <div className="fixed inset-0 z-[110] flex flex-col bg-[#0A0A0A]">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative w-full h-full flex flex-col overflow-y-auto"
            >
              {/* Top Banner with Aura */}
              <div className="relative h-48 md:h-64 bg-gradient-to-b from-[#FF6321]/20 to-transparent flex items-end justify-center pb-0 shrink-0">
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] md:w-[300px] h-[200px] md:h-[300px] bg-[#FF6321]/30 blur-[80px] md:blur-[100px] rounded-full animate-pulse" />
                </div>
                
                <div className="relative translate-y-1/2">
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-full p-1.5 bg-gradient-to-br from-[#FF6321] via-white/20 to-transparent shadow-2xl relative group">
                    <div className="w-full h-full rounded-full bg-[#0A0A0A] overflow-hidden border-2 border-black">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl md:text-4xl font-black text-white/20">
                          {user.displayName?.substring(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Level Badge */}
                    <div className="absolute -bottom-1 -right-1 bg-white text-black px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-black shadow-lg">
                      LVL_99
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setIsProfileOpen(false)}
                  className="absolute top-4 left-4 md:top-8 md:left-8 flex items-center gap-1.5 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white/70 hover:text-white font-bold text-[10px] md:text-xs uppercase tracking-widest"
                >
                  <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" />
                  {t.back}
                </button>

                <button 
                  onClick={() => setIsProfileOpen(false)}
                  className="absolute top-4 right-4 md:top-8 md:right-8 w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/50 hover:text-white"
                >
                  <X className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>

              {/* Identity Section */}
              <div className="mt-16 md:mt-24 px-4 md:px-8 max-w-4xl mx-auto w-full text-center pb-8 md:pb-12 flex flex-col min-h-min">
                <h2 className="text-2xl md:text-4xl font-black tracking-tight text-white mb-1 md:mb-2">{user.displayName || 'Anonymous User'}</h2>
                <div className="flex flex-row justify-center items-center gap-2 md:gap-4 text-[10px] md:text-xs text-brand-muted font-medium mb-8 md:mb-12">
                  <span className="flex items-center gap-1 md:gap-1.5">
                    <Mail className="w-3 h-3 md:w-4 md:h-4 text-[#FF6321]" />
                    <span className="truncate max-w-[120px] sm:max-w-none">{user.email}</span>
                  </span>
                  <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-white/20"></span>
                  <span className="flex items-center gap-1 md:gap-1.5 opacity-60">
                    <Fingerprint className="w-3 h-3 md:w-4 md:h-4 text-[#FF6321]" />
                    ID: {user.uid.substring(0, 8)}
                  </span>
                </div>

                {/* Grid Bento Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 w-full">
                  {[
                    { label: "Active Nodes", value: `${sessions.length}`, icon: <History className="w-4 h-4 md:w-5 md:h-5" /> },
                    { label: "Neural Packets", value: `${sessions.reduce((acc, s) => acc + s.messages.length, 0)}`, icon: <Zap className="w-4 h-4 md:w-5 md:h-5" /> },
                    { label: "Access Tier", value: "Root_Admin", icon: <Crown className="w-4 h-4 md:w-5 md:h-5" /> },
                    { label: "Sec-Protocol", value: "Verified", icon: <ShieldCheck className="w-4 h-4 md:w-5 md:h-5" /> }
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 + (i * 0.05) }}
                      className="bg-white/5 border border-white/5 p-4 md:p-6 rounded-2xl md:rounded-3xl hover:bg-white/[0.08] hover:border-white/10 transition-all group cursor-default text-left"
                    >
                      <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center text-[#FF6321] mb-3 md:mb-4 group-hover:scale-110 transition-all">
                        {stat.icon}
                      </div>
                      <p className="text-[10px] md:text-xs font-bold text-brand-muted uppercase tracking-tighter mb-0.5 md:mb-1">{stat.label}</p>
                      <p className="text-base md:text-xl font-black text-white">{stat.value}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Footer Controls */}
                <div className="mt-8 md:mt-auto flex flex-col md:flex-row items-center justify-between gap-6 pt-8 md:pt-12 border-t border-white/5 w-full">
                  <div className="flex flex-col items-center md:items-start text-center md:text-left">
                    <span className="text-[10px] md:text-xs font-bold text-brand-muted uppercase tracking-widest">System Connection</span>
                    <div className="text-xs md:text-sm font-black text-white flex items-center gap-1.5 md:gap-2 mt-1 md:mt-1.5">
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
                      <span className="truncate max-w-[200px] sm:max-w-none">LINKED_THROUGH_GOOGLE_CLOUD</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full md:w-auto">
                    <button 
                      onClick={() => { setIsProfileOpen(false); setIsSettingsOpen(true); }}
                      className="flex-1 md:flex-none px-6 md:px-8 py-3 md:py-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all"
                    >
                      Configure
                    </button>
                    <button 
                      onClick={() => { handleLogout(); setIsProfileOpen(false); }}
                      className="flex-1 md:flex-none px-8 md:px-10 py-3 md:py-4 bg-[#FF6321] hover:bg-white hover:text-black text-white rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-[#FF6321]/20 active:scale-95"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>

              {/* Ambient bottom garnish */}
              <div className="h-2 bg-gradient-to-r from-transparent via-[#FF6321] to-transparent opacity-30 mt-auto shrink-0" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Vision Mode */}
      <AnimatePresence>
        {isVisionOpen && <VisionModeView />}
      </AnimatePresence>
    </div>
  );
}
