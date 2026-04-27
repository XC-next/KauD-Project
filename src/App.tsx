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
  Mic,
  Video as VideoIcon,
  Quote,
  ArrowLeft
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { createChat, summarizeMessages, DEFAULT_SYSTEM_INSTRUCTION, AVAILABLE_MODELS } from "./services/gemini";
import { LiveAudio } from "./components/LiveAudio";
import { LiveVideo } from "./components/LiveVideo";

const PERSONAS = [
  { 
    id: "default", 
    name: "បទដ្ឋាន", 
    icon: <Bot className="w-3.5 h-3.5" />, 
    instruction: "You are KauD Assistant, a Knowledge and Utility Design assistant. You are precise, efficient, and helpful. Focus on providing high-quality assistance in Khmer." 
  },
  { 
    id: "creative", 
    name: "ការច្នៃប្រឌិត", 
    icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />, 
    instruction: "You are a creative muse. Your responses are imaginative, descriptive, and focus on storytelling and out-of-the-box thinking. Express your creativity in Khmer." 
  },
  { 
    id: "coder", 
    name: "អ្នកអភិវឌ្ឍន៍", 
    icon: <Code className="w-3.5 h-3.5 text-blue-400" />, 
    instruction: "You are an expert software engineer. Provide code-first solutions, explain architectural patterns, and prioritize best practices and efficiency. Explain technical concepts clearly in Khmer." 
  },
  { 
    id: "analyst", 
    name: "អ្នកវិភាគ", 
    icon: <Brain className="w-3.5 h-3.5 text-green-400" />, 
    instruction: "You are a data-driven analyst. Focus on facts, structured breakdowns, pros and cons, and logical reasoning. Present your analysis accurately in Khmer." 
  },
  { 
    id: "minimal", 
    name: "សាមញ្ញបំផុត", 
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
import { LogIn, LogOut, UserCircle } from "lucide-react";

export default function App() {
  const { user, loading: authLoading } = useAuth();
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
        title: "New Session",
        messages: [
          {
            id: "welcome",
            role: "assistant",
            content: "សួស្តី! ខ្ញុំគឺ **KauD Assistant** ជាជំនួយការរចនាចំណេះដឹង និងឧបករណ៍ប្រើប្រាស់របស់អ្នក។ តើខ្ញុំអាចជួយអ្នកក្នុងការរចនាដំណោះស្រាយ ឬសិក្សាអំពីប្រធានបទអ្វីខ្លះនៅថ្ងៃនេះ?",
            timestamp: new Date().toISOString(),
          },
        ],
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
  const [selectedPersona, setSelectedPersona] = useState(PERSONAS[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveAudioOpen, setIsLiveAudioOpen] = useState(false);
  const [isLiveVideoOpen, setIsLiveVideoOpen] = useState(false);
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isLoading]);

  const createNewSession = () => {
    const newSession: Session = {
      id: Date.now().toString(),
      title: "New Session",
      messages: [
        {
          id: "welcome-" + Date.now(),
          role: "assistant",
          content: "Hello! I'm **KauD Assistant**. How can I help you today?",
          timestamp: new Date().toISOString(),
        },
      ],
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
            title: "New Session",
            messages: [
              {
                id: "welcome-" + Date.now(),
                role: "assistant",
                content: "សួស្តី! ខ្ញុំគឺ **KauD Assistant**។ តើខ្ញុំអាចជួយអ្នកអ្វីខ្លះនៅថ្ងៃនេះ?",
                timestamp: new Date().toISOString(),
              },
            ],
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
      alert("កម្មវិធីរុករករបស់អ្នកមិនគាំទ្រការសម្គាល់សំឡេងទេ។");
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

    const messageContent = uploadedFiles.length > 0 
      ? sanitizedInput + "\n\n" + uploadedFiles.map(f => `[File uploaded: ${f.name} (${f.type})]`).join("\n")
      : sanitizedInput;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };

    setSessions((prev) => 
      prev.map((s) => {
        if (s.id === activeSessionId) {
          const isFirstMessage = s.messages.length <= 1;
          const newTitle = isFirstMessage ? (sanitizedInput.length > 30 ? sanitizedInput.substring(0, 30) + "..." : sanitizedInput) : s.title;
          return {
            ...s,
            title: newTitle || "New Session",
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
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else {
      // Regenerate: Remove this assistant message and trigger handleSend with the last user message
      const sessionMessages = activeSession.messages;
      const lastUserMsgIndex = [...sessionMessages].reverse().findIndex(m => m.role === "user");
      
      if (lastUserMsgIndex !== -1) {
        const actualIndex = sessionMessages.length - 1 - lastUserMsgIndex;
        const lastUserContent = sessionMessages[actualIndex].content;
        
        // Remove assistant message and everything after it
        const messageIndex = sessionMessages.findIndex(m => m.id === msg.id);
        const filteredMessages = sessionMessages.slice(0, messageIndex);
        
        setSessions(prev => prev.map(s => 
          s.id === activeSessionId ? { ...s, messages: filteredMessages } : s
        ));
        
        // Trigger send with the prompt again
        setInput(lastUserContent);
        // We'll trust the user to hit send or we can auto-send
        // I'll auto-send for a true "Restore/Retry" feel
        setTimeout(() => {
          handleSendWithContent(lastUserContent);
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
                title="បិទរបារចំហៀង"
              >
                <X className="w-4 h-4 opacity-80" />
              </button>
            </div>

            <div className="p-4 border-b border-brand-border bg-brand-sidebar">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                <input
                  type="text"
                  placeholder="ស្វែងរកការជជែក..."
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
                ការជជែកថ្មី
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
                    Audio Live
                  </button>
                  <button 
                    onClick={() => setIsLiveVideoOpen(true)}
                    className="flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase font-bold tracking-widest bg-brand-bg border border-brand-border rounded-xl text-brand-text hover:border-[#FF6321] transition-all group shadow-sm"
                  >
                    <div className="p-1.5 bg-[#FF6321]/10 rounded-lg group-hover:scale-110 transition-transform">
                      <VideoIcon className="w-3.5 h-3.5 text-[#FF6321]" />
                    </div>
                    Video Live
                  </button>
                </div>
              </div>

              <div className="px-3 mb-2 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                ការជជែកថ្មីៗ
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
                  No sessions found
                </div>
              )}
            </nav>

            <div className="p-4 border-t border-brand-border space-y-1 bg-brand-sidebar text-brand-text">
              <button 
                onClick={() => {
                  setTempSystemPrompt(activeSession.systemPrompt || DEFAULT_SYSTEM_INSTRUCTION);
                  setIsSettingsOpen(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#44403C] hover:bg-[#F5F5F4] rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4 opacity-60" />
                Settings
              </button>
              <button 
                onClick={() => setIsAboutOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#44403C] hover:bg-[#F5F5F4] rounded-lg transition-colors"
              >
                <Info className="w-4 h-4 opacity-60" />
                About KauD
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
                title="បើករបារចំហៀង"
              >
                <Menu className="w-5 h-5 text-brand-text opacity-80 group-hover:opacity-100" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <h1 className="font-semibold text-sm lg:text-base">សម័យបច្ចុប្បន្ន</h1>
                <p className="text-[10px] lg:text-xs text-brand-muted flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#FF6321]" />
                  ដៃគូប្រឹក្សាចំណេះដឹង និងឧបករណ៍ប្រើប្រាស់
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
              {isSummarizing ? "កំពុងសង្ខេប..." : "សង្ខេប"}
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
                <span className="font-bold mr-1 uppercase text-[10px] tracking-wider">សេចក្តីសង្ខេបនៃសម័យជជែក:</span>
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
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 scroll-smooth">
          <div className="max-w-3xl mx-auto w-full space-y-8">
            {activeSession.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-center space-y-12">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative"
                >
                  <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-[#FF6321] to-[#E5591D] flex items-center justify-center text-white shadow-2xl shadow-[#FF6321]/20 relative z-10 mx-auto">
                    <History className="w-10 h-10 animate-pulse" />
                  </div>
                  <div className="absolute inset-0 bg-[#FF6321] blur-3xl opacity-20 -z-0 scale-150" />
                </motion.div>

                <div className="space-y-4">
                  <motion.h2 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-4xl md:text-5xl font-black tracking-tighter text-brand-text flex flex-wrap justify-center gap-x-3"
                  >
                    <span>តើខ្ញុំអាចជួយអ្វីខ្លះ</span> 
                    <span className="text-[#FF6321]">ថ្ងៃនេះ?</span>
                  </motion.h2>
                  <motion.p 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-brand-muted text-lg font-medium max-w-md mx-auto"
                  >
                    ជំនួយការបច្ចេកទេស កម្រិតខ្ពស់សម្រាប់គ្រប់ការងាររបស់អ្នក។
                  </motion.p>
                </div>

                <motion.div 
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full pt-8"
                >
                  {[
                    { title: "Creative Logic", desc: "សរសេរកូដ និងដោះស្រាយបញ្ហា", icon: <Terminal className="w-5 h-5" /> },
                    { title: "Smart Summary", desc: "សង្ខេបខ្លឹមសារអត្ថបទវែងៗ", icon: <Zap className="w-5 h-5" /> },
                    { title: "Technical Vision", desc: "វិភាគរូបភាព និងឯកសារ", icon: <ImageIcon className="w-5 h-5" /> },
                    { title: "Neural Chat", desc: "ជជែកកម្សាន្ត និងពិភាក្សា", icon: <Layers className="w-5 h-5" /> }
                  ].map((feature, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(`សូមប្រាប់ខ្ញុំបន្ថែមអំពី ${feature.title}`)}
                      className="group p-6 bg-brand-sidebar border border-brand-border rounded-[2rem] text-left hover:border-[#FF6321] hover:bg-brand-bg transition-all active:scale-95 flex flex-col gap-3 shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center text-[#FF6321] group-hover:scale-110 group-hover:bg-[#FF6321]/10 transition-all">
                        {feature.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-brand-text group-hover:text-[#FF6321] transition-colors">{feature.title}</h4>
                        <p className="text-xs text-brand-muted font-medium">{feature.desc}</p>
                      </div>
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
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={MarkdownComponents}
                      >
                        {msg.content}
                      </ReactMarkdown>
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
                  <p className="text-[10px] text-brand-muted animate-pulse font-bold uppercase tracking-tighter">កំពុងគិត...</p>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 lg:p-8 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent">
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
                      title="លុប"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Persona Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar persona-selector-container">
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-muted shrink-0 mr-1">បុគ្កលិកលក្ខណៈ:</span>
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
                  {p.name}
                </button>
              ))}
            </div>

            <div className="relative flex items-end gap-2 bg-brand-sidebar border border-brand-border rounded-2xl p-2 shadow-lg focus-within:ring-2 focus-within:ring-[#FF6321]/20 transition-all">
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
                placeholder="សួរសំណួរទៅកាន់ KauD Assistant..."
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 px-4 text-sm min-h-[52px] max-h-[200px] text-brand-text font-medium leading-relaxed"
                rows={1}
              />
              <div className="flex items-center gap-1 pb-1 pr-1">
                <div className="relative" ref={quickActionsRef}>
                  <button 
                    onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
                    className="p-2.5 text-brand-muted hover:bg-brand-bg hover:text-[#FF6321] rounded-xl transition-colors"
                    title="សកម្មភាពរហ័ស (Quick Actions)"
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
                            ការជជែកថ្មី (New Chat)
                          </button>
                          <button 
                            onClick={() => { handleSummarize(); setIsQuickActionsOpen(false); }}
                            disabled={isSummarizing || activeSession.messages.length < 2}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-brand-text hover:bg-brand-bg hover:text-[#FF6321] rounded-xl transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FileText className="w-4 h-4" />
                            សង្ខេប (Summarize)
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
                            ប្តូរបុគ្គលិកលក្ខណៈ (Persona)
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
                  title="Voice Typing"
                >
                  <Mic className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-brand-muted hover:bg-brand-bg rounded-xl transition-colors"
                  title="Upload File"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                {isLoading ? (
                  <button
                    onClick={handleStopGeneration}
                    className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all shadow-sm"
                    title="Stop Generation"
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
              KauD Assistant អាចមានកំហុស។ សូមផ្ទៀងផ្ទាត់ព័ត៌មានសំខាន់ៗ។
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
                <h2 className="text-lg font-bold">ការកំណត់ទូទៅ</h2>
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
                    រូបរាង
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'light', name: 'ពន្លឺ', color: 'bg-[#F5F5F4]' },
                      { id: 'dark', name: 'ងងឹត', color: 'bg-[#0C0A09]' },
                      { id: 'midnight', name: 'ពណ៌ខៀវអធ្រាត្រ', color: 'bg-[#020617]' },
                      { id: 'forest', name: 'ព្រៃឈើ', color: 'bg-[#052e16]' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-xl border transition-all text-xs font-medium",
                          theme === t.id 
                            ? "border-[#FF6321] bg-brand-bg ring-1 ring-[#FF6321]" 
                            : "border-brand-border hover:bg-brand-bg"
                        )}
                      >
                        <div className={cn("w-4 h-4 rounded-full border border-white/20", t.color)} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-brand-muted">
                    ការណែនាំសម្រាប់សម័យជជែក
                  </label>
                  <p className="text-[10px] text-brand-muted">តើអ្នកចង់ឱ្យជំនួយការមានឥរិយាបទបែបណានៅក្នុងការជជែកនេះ?</p>
                  <textarea
                    value={tempSystemPrompt}
                    onChange={(e) => setTempSystemPrompt(e.target.value)}
                    className="w-full h-32 p-4 text-sm bg-brand-bg border border-brand-border rounded-xl focus:ring-1 focus:ring-[#FF6321] outline-none transition-all resize-none text-brand-text"
                    placeholder="Enter system instructions..."
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleUpdateSystemPrompt}
                    className="px-6 py-2 text-sm font-bold bg-[#FF6321] text-white rounded-xl hover:opacity-90 transition-all shadow-md active:scale-95"
                  >
                    Save Changes
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
                        "យើងបង្កើត KauD ដើម្បីក្លាយជាដៃគូបញ្ញាសិប្បនិម្មិតដ៏ឆ្លាតវៃបំផុត ដែលយល់អំពីបរិបទកម្ពុជា និងជួយសម្រួលដល់ការងារប្រចាំថ្ងៃរបស់អ្នកឱ្យកាន់តែប្រសើរ។"
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
                  ថយក្រោយ
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
    </div>
  );
}
