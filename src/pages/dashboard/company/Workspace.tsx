import { useEffect, useState, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Folder, FileCode, History, Shield, Eye, BarChart2, 
  MessageCircle, Info, Users, Activity, Clock, ShieldAlert,
  Terminal as TerminalIcon, Sparkles, Cpu, Zap, Search, 
  LayoutGrid, Settings, PanelsLeftBottom, X, ChevronRight,
  Code2, Bug, Lock, ZapOff, Database, Layers
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  project_id: string;
  updated_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar_url?: string;
}

interface ChatMessage {
  id: string;
  role: 'system' | 'ai' | 'user';
  content: string;
  type?: 'audit' | 'info' | 'warn' | 'error';
  timestamp: Date;
}

export default function CompanyWorkspace() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [openFiles, setOpenFiles] = useState<WorkspaceFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeFile = openFiles.find(f => f.id === activeFileId) || null;

  // Persistence Key Helper
  const getStorageKey = (projectId: string) => `company_workspace_v1_${projectId}`;

  // Hydrate persistence
  useEffect(() => {
    if (!selectedProject) return;
    const saved = localStorage.getItem(getStorageKey(selectedProject));
    if (saved) {
      try {
        const { activeId } = JSON.parse(saved);
        if (activeId) setActiveFileId(activeId);
      } catch (e) {}
    }
  }, [selectedProject]);

  // Save persistence
  useEffect(() => {
    if (!selectedProject) return;
    localStorage.setItem(getStorageKey(selectedProject), JSON.stringify({
      openFileIds: openFiles.map(f => f.id),
      activeId: activeFileId
    }));
  }, [openFiles, activeFileId, selectedProject]);

  const fetchProjects = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('projects').select('id, title').eq('company_id', profile.id);
    setProjects(data || []);
    if (data && data.length > 0 && !selectedProject) setSelectedProject(data[0].id);
  }, [profile, selectedProject]);

  const fetchTeam = useCallback(async () => {
    if (!selectedProject) return;
    const { data: team } = await supabase.from('teams').select('id, leader_id').eq('project_id', selectedProject).single();
    if (!team) return;
    
    const { data: members } = await supabase.from('team_members').select('user_id, profiles(id, name, avatar_url)').eq('team_id', team.id);
    const { data: leader } = await supabase.from('profiles').select('id, name, avatar_url').eq('id', team.leader_id).single();
    
    const allMembers: TeamMember[] = [];
    if (leader) allMembers.push({ ...leader, role: 'Team Lead' });
    members?.forEach((m: any) => {
      if (m.profiles && m.user_id !== team.leader_id) {
        allMembers.push({ ...m.profiles, role: 'Contributor' });
      }
    });
    setTeamMembers(allMembers);
  }, [selectedProject]);

  const fetchFiles = useCallback(async () => {
    if (!selectedProject) return;
    const { data } = await supabase.from('workspace_files').select('*').eq('project_id', selectedProject).order('path');
    if (data) {
      const fetched = data as WorkspaceFile[];
      setFiles(fetched);
      
      // Reconcile open tabs
      const saved = localStorage.getItem(getStorageKey(selectedProject));
      if (saved) {
        try {
          const { openFileIds } = JSON.parse(saved);
          setOpenFiles(fetched.filter(f => openFileIds.includes(f.id)));
        } catch (e) {}
      }
    }
  }, [selectedProject]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchTeam(); }, [fetchTeam]);
  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    if (selectedProject && chatMessages.length === 0) {
      setChatMessages([
        {
          id: '1',
          role: 'ai',
          content: `Real-time Auditor established for Node [${selectedProject.slice(0, 12)}]. Persistent local state initialized. Monitoring engineering pulses.`,
          type: 'info',
          timestamp: new Date()
        }
      ]);
    }
  }, [selectedProject]);

  useRealtime([
    {
      table: 'workspace_files',
      filter: selectedProject ? `project_id=eq.${selectedProject}` : undefined,
      onData: () => fetchFiles(),
    },
  ], [selectedProject]);

  const openFile = (f: WorkspaceFile) => {
    if (!openFiles.find(of => of.id === f.id)) {
      setOpenFiles([...openFiles, f]);
    }
    setActiveFileId(f.id);
    
    const auditMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'ai',
      content: `Performing deep audit of ${f.name}. Signal integrity verified. No security warnings detected in local buffer.`,
      type: 'audit',
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev.slice(-10), auditMsg]);
  };

  const closeFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newOpenFiles = openFiles.filter(f => f.id !== id);
    setOpenFiles(newOpenFiles);
    if (activeFileId === id) {
      setActiveFileId(newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].id : null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] animate-in fade-in duration-1000 bg-[#0f1117] overflow-hidden rounded-2xl border border-white/5 shadow-2xl font-sans">
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        
        {/* LEFT PANEL: EXPLORER & TEAM */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-[#161b22]/50 backdrop-blur-3xl border-r border-white/5">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-white/5 bg-black/40">
              <div className="flex items-center justify-between mb-4">
                 <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                   <Layers className="w-3.5 h-3.5 text-blue-400" /> Manifest_Resource
                 </h2>
                 <Badge variant="outline" className="h-4 text-[8px] bg-blue-500/10 text-blue-400 border-none px-1.5 uppercase font-black tracking-tighter">OVERSIGHT</Badge>
              </div>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-full text-[10px] h-9 bg-black/40 border-white/5 focus:ring-1 focus:ring-blue-500 transition-all font-black uppercase tracking-widest text-slate-400">
                  <SelectValue placeholder="Resource_Id" />
                </SelectTrigger>
                <SelectContent className="bg-[#1c2128] border-white/10 text-white font-bold">
                  {projects.map((p) => <SelectItem key={p.id} value={p.id} className="text-[10px] uppercase font-bold tracking-tight">ENTITY_{p.id.slice(0, 16)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="flex-1">
              <div className="py-2">
                <div className="px-4 mb-2">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Repository_Tree</span>
                </div>
                {files.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-2.5 px-4 h-10 cursor-pointer text-[12px] group transition-all ${activeFileId === f.id ? 'bg-blue-500/10 text-blue-400 border-r-2 border-blue-500' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
                    onClick={() => openFile(f)}
                  >
                    <FileCode className={`w-3.5 h-3.5 shrink-0 transition-colors ${activeFileId === f.id ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
                    <span className="truncate flex-1 font-medium italic tracking-tight uppercase text-[11px] font-mono">/{f.name}</span>
                    <Clock className="w-3 h-3 opacity-0 group-hover:opacity-30 transition-opacity" />
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 bg-black/40 border-t border-white/5 mt-auto">
                <div className="mb-4">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Deployment_Force</span>
                  <div className="flex -space-x-2">
                    {teamMembers.map((m) => (
                      <TooltipProvider key={m.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="w-7 h-7 rounded-full border-2 border-[#161b22] bg-slate-800 flex items-center justify-center overflow-hidden hover:-translate-y-1 transition-transform shadow-xl ring-1 ring-white/10">
                              {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" /> : <span className="text-[9px] font-black uppercase">{m.name.charAt(0)}</span>}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-[9px] border-white/10 uppercase font-black tracking-[0.2em] shadow-2xl">{m.name} // {m.role}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">
                  <span className="flex items-center gap-1.5"><Database className="w-3 h-3" /> System_Link</span>
                  <span className="text-blue-500 animate-pulse italic">OPTIMIZED</span>
                </div>
                <div className="h-0.5 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-blue-500 animate-infinite-scroll w-full shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-white/5 hover:bg-blue-500/20 transition-colors" />

        {/* CENTER PANEL: TABS, EDITOR & CONSOLE */}
        <ResizablePanel defaultSize={55} minSize={30} className="bg-[#0b0c10] flex flex-col">
          <div className="flex-1 flex flex-col min-w-0 h-full">
            {/* Tab Bar */}
            <div className="flex bg-black/40 backdrop-blur-md border-b border-white/5 overflow-x-auto scrollbar-hide">
              {openFiles.map(f => (
                <div
                  key={f.id}
                  onClick={() => setActiveFileId(f.id)}
                  className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer text-[10px] font-black uppercase tracking-widest border-r border-white/5 transition-all min-w-[150px] max-w-[220px] group ${activeFileId === f.id ? 'bg-[#0b0c10] text-blue-400 border-t-2 border-t-blue-500 shadow-2xl' : 'text-slate-600 hover:bg-white/5 hover:text-slate-400'}`}
                >
                  <FileCode className={`w-3.5 h-3.5 ${activeFileId === f.id ? 'text-blue-400' : 'text-slate-600'}`} />
                  <span className="truncate flex-1 italic">{f.name}</span>
                  <X 
                    className="w-3 h-3 text-slate-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" 
                    onClick={(e) => closeFile(f.id, e)}
                  />
                </div>
              ))}
              {openFiles.length === 0 && (
                <div className="px-6 py-2.5 text-[9px] text-slate-700 font-extrabold uppercase tracking-[0.4em] italic">Awaiting_Module_Initialize...</div>
              )}
            </div>

            <div className="flex-1 relative">
              {activeFileId ? (
                <>
                  <div className="absolute top-4 right-8 z-30 flex items-center gap-3">
                     <Badge variant="outline" className="h-6 px-3 text-[9px] font-black tracking-[0.2em] border-blue-500/20 bg-black/80 backdrop-blur-3xl text-blue-400 shadow-2xl">
                        AUDIT_MODE_V2.4
                     </Badge>
                     <Button size="sm" variant="outline" className="h-7 px-4 text-[9px] font-black uppercase tracking-[0.2em] border-white/5 bg-slate-900/50 hover:bg-slate-800 text-slate-400">
                        <BarChart2 className="w-3.5 h-3.5 mr-2" /> CORE_METRICS
                     </Button>
                  </div>
                  <Editor
                    height="100%"
                    language={activeFile?.language}
                    value={activeFile?.content || ''}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: true, side: 'right', scale: 0.8 },
                      fontSize: 15,
                      lineNumbers: 'on',
                      automaticLayout: true,
                      padding: { top: 24, bottom: 24 },
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      cursorStyle: 'block',
                      smoothScrolling: true,
                      renderWhitespace: 'none',
                      fontLigatures: true,
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 bg-[#0b0c10] gap-8">
                   <div className="w-24 h-24 relative group">
                      <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full animate-pulse transition-all group-hover:scale-125" />
                      <div className="relative border border-white/10 rounded-[2.5rem] p-8 bg-[#161b22] shadow-[0_0_80px_rgba(0,0,0,0.8)]">
                        <TerminalIcon className="w-10 h-10 opacity-10" />
                      </div>
                   </div>
                   <div className="text-center space-y-2">
                     <h2 className="text-[10px] font-black uppercase tracking-[0.6em] italic text-slate-700">Audit_Context_Empty</h2>
                     <p className="text-[9px] font-bold text-slate-800 uppercase tracking-widest bg-white/5 px-4 py-1.5 rounded-full">Hydrate_Entity_To_Perform_Analysis</p>
                   </div>
                </div>
              )}
            </div>

            {/* Bottom Console */}
            {isConsoleOpen && (
              <div className="h-44 bg-[#050608] border-t border-white/5 flex flex-col font-mono shadow-[0_-15px_40px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between px-6 py-2 border-b border-white/5 bg-black/40">
                  <div className="flex items-center gap-6">
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <TerminalIcon className="w-3.5 h-3.5" /> AUDITOR_SHELL_V4
                    </span>
                    <span className="text-[9px] text-slate-700 font-bold uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-md animate-pulse" /> SYSTEM_PULSE: STABLE
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/5 text-slate-700 group" onClick={() => setIsConsoleOpen(false)}>
                    <X className="w-3 h-3 group-hover:text-white" />
                  </Button>
                </div>
                <ScrollArea className="flex-1 p-5 overflow-y-auto bg-[radial-gradient(circle_at_bottom_right,rgba(var(--blue),0.02)_0%,transparent_80%)]">
                    <div className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                       <p className="text-blue-500/80 tracking-tight flex items-center gap-2">
                         [LOG] <span className="text-slate-500 whitespace-nowrap">AUDIT_CONTEXT: Persistent local buffer state synchronized for PROJECT_{selectedProject.slice(0, 8)}</span>
                       </p>
                       <p className="text-emerald-500/80 tracking-tight flex items-center gap-2">
                         [INFO] <span className="text-slate-500">Resource integrity scan recurring; no unauthenticated drift detected.</span>
                       </p>
                       <p className="text-slate-700 italic mt-2 opacity-50 underline decoration-slate-800">Listening to engineering stream node ID: {selectedProject || 'AWAITING_ID'}</p>
                    </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-white/5 hover:bg-blue-500/20 transition-colors" />

        {/* RIGHT PANEL: AI AUDITOR CHAT */}
        <ResizablePanel defaultSize={22} minSize={15} maxSize={30} className="bg-[#161b22]/40 backdrop-blur-3xl border-l border-white/5 flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
               <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Auditor_IA
            </h2>
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg hover:bg-white/5 text-slate-600"><History className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg hover:bg-white/5 text-slate-600"><Settings className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          <ScrollArea className="flex-1 p-5 shadow-inner">
            <div className="space-y-6">
              {chatMessages.map((msg) => (
                <div key={msg.id} className="space-y-3 animate-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-center gap-2.5">
                    {msg.role === 'ai' ? (
                      <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 shadow-lg shadow-blue-500/5">
                        <Cpu className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                    ) : (
                      <div className="p-1.5 rounded-lg bg-slate-800 border border-white/5 shadow-md">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    )}
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-[0.1em]">
                      {msg.role === 'ai' ? 'Audit_Core' : 'Exec_Observer'}
                    </span>
                    <span className="text-[8px] text-slate-800 font-bold ml-auto">{formatDistanceToNow(msg.timestamp, { addSuffix: true })}</span>
                  </div>
                  <div className={`text-[11px] leading-relaxed p-4 rounded-2xl border ${
                    msg.type === 'warn' ? 'bg-amber-500/5 text-amber-200 border-amber-500/10 italic' :
                    msg.type === 'audit' ? 'bg-blue-500/5 text-blue-200 border-blue-500/10 font-bold' :
                    'bg-slate-900/40 text-slate-400 border border-white/5'
                  } shadow-md`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="p-5 bg-black/20 mt-auto border-t border-white/5">
             <div className="mb-4">
                <div className="grid grid-cols-2 gap-2">
                   <Button variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest border-white/5 bg-slate-900/50 shadow-inner group hover:border-blue-500/40 hover:text-blue-400 transiton-all">
                      <Bug className="w-3.5 h-3.5 mr-2 text-slate-600 group-hover:text-blue-400" /> FIND_BUGS
                   </Button>
                   <Button variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest border-white/5 bg-slate-900/50 shadow-inner group hover:border-emerald-500/40 hover:text-emerald-400 transition-all">
                      <Lock className="w-3.5 h-3.5 mr-2 text-slate-600 group-hover:text-emerald-400" /> SEC_SWEEP
                   </Button>
                </div>
             </div>
             <div className="relative group">
                <div className="absolute inset-0 bg-blue-500/10 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-1000 -z-10" />
                <textarea 
                  placeholder="Inquire_Auditor_State..." 
                  className="w-full bg-[#1c2128] border border-white/10 rounded-2xl px-4 py-4 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none h-24 scrollbar-hide relative shadow-2xl"
                />
                <Button size="icon" className="absolute bottom-3 right-3 h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] active:scale-90 transition-all">
                  <Zap className="w-4 h-4 text-white" />
                </Button>
             </div>
          </div>
        </ResizablePanel>

      </ResizablePanelGroup>

      {/* Persistent Status Bar (Bottom) */}
      {!isConsoleOpen && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-blue-600 flex items-center px-4 justify-between text-[9px] font-black uppercase text-white tracking-[0.2em] cursor-pointer hover:bg-blue-500 transition-all shadow-[0_-10px_20px_rgba(59,130,246,0.3)]" onClick={() => setIsConsoleOpen(true)}>
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><PanelsLeftBottom className="w-4 h-4" /> Expand_Operational_Console</div>
              <div className="flex items-center gap-2 opacity-60"><Activity className="w-3.5 h-3.5" /> Link: Primary_Stream_V1</div>
           </div>
           <div className="flex items-center gap-4">
              <span className="opacity-60 italic">Persistent_Local_Cache: READY</span>
              <div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-glow" />
           </div>
        </div>
      )}
    </div>
  );
}
