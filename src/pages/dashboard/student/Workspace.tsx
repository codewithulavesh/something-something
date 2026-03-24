import { useEffect, useState, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  FilePlus, Save, Folder, FileCode, Trash2, Terminal, Users, 
  Play, Download, History, Code2, Share2, ShieldCheck, Zap,
  Activity, CloudRain, Clock, Sparkles, Cpu, Search, 
  LayoutGrid, Settings, PanelsLeftBottom, X, ChevronRight,
  Bug, Lock, Send, MessageSquare, Database
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';

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
  timestamp: Date;
}

export default function StudentWorkspace() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [openFiles, setOpenFiles] = useState<WorkspaceFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileLang, setNewFileLang] = useState('javascript');
  const [saving, setSaving] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('System: Collaborative Workspace initialized. Local Persistent Storage: ENABLED.\n');
  const [terminalInput, setTerminalInput] = useState('');
  const [isAutoSync, setIsAutoSync] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);

  const activeFile = openFiles.find(f => f.id === activeFileId) || null;
  const lastSavedContent = useRef<string>('');
  const syncTimer = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persistence Keys
  const getStorageKey = (projectId: string) => `workspace_state_${projectId}`;
  const getDraftKey = (fileId: string) => `file_draft_${fileId}`;

  // Hydrate Workspace State from Local Storage
  useEffect(() => {
    if (!selectedProject) return;
    const savedState = localStorage.getItem(getStorageKey(selectedProject));
    if (savedState) {
      try {
        const { openFileIds, activeId } = JSON.parse(savedState);
        // We'll reconcile these once files are fetched
        if (activeId) setActiveFileId(activeId);
      } catch (e) { console.error("Failed to hydrate workspace state", e); }
    }
  }, [selectedProject]);

  // Persist Sidebar/Tabs state
  useEffect(() => {
    if (!selectedProject) return;
    const state = {
      openFileIds: openFiles.map(f => f.id),
      activeId: activeFileId
    };
    localStorage.setItem(getStorageKey(selectedProject), JSON.stringify(state));
  }, [openFiles, activeFileId, selectedProject]);

  // Handle Draft Persistence (Unsaved Changes)
  useEffect(() => {
    if (activeFileId && code !== lastSavedContent.current) {
      localStorage.setItem(getDraftKey(activeFileId), code);
    } else if (activeFileId && code === lastSavedContent.current) {
      localStorage.removeItem(getDraftKey(activeFileId));
    }
  }, [code, activeFileId]);

  const fetchProjects = useCallback(async () => {
    if (!profile) return;
    const { data: leaderTeams } = await supabase.from('teams').select('project_id, projects(id, title)').eq('leader_id', profile.id);
    const { data: memberTeams } = await supabase.from('team_members').select('team_id, teams(project_id, projects(id, title))').eq('user_id', profile.id);
    
    const projMap = new Map();
    leaderTeams?.forEach((t: any) => { if (t.projects) projMap.set(t.projects.id, t.projects); });
    memberTeams?.forEach((m: any) => { if (m.teams?.projects) projMap.set(m.teams.projects.id, m.teams.projects); });
    
    const projs = Array.from(projMap.values());
    setProjects(projs);
    if (projs.length > 0 && !selectedProject) setSelectedProject(projs[0].id);
  }, [profile, selectedProject]);

  const fetchTeam = useCallback(async () => {
    if (!selectedProject) return;
    const { data: team } = await supabase.from('teams').select('id, leader_id').eq('project_id', selectedProject).single();
    if (!team) return;
    
    const { data: members } = await supabase.from('team_members').select('user_id, profiles(id, name, avatar_url)').eq('team_id', team.id);
    const { data: leader } = await supabase.from('profiles').select('id, name, avatar_url').eq('id', team.leader_id).single();
    
    const allMembers: TeamMember[] = [];
    if (leader) allMembers.push({ ...leader, role: 'Lead Engineer' });
    members?.forEach((m: any) => {
      if (m.profiles && m.user_id !== team.leader_id) {
        allMembers.push({ ...m.profiles, role: 'Developer' });
      }
    });
    setTeamMembers(allMembers);
  }, [selectedProject]);

  const fetchFiles = useCallback(async () => {
    if (!selectedProject) return;
    const { data } = await supabase.from('workspace_files').select('*').eq('project_id', selectedProject).order('path');
    if (data) {
      const fetchedFiles = data as WorkspaceFile[];
      setFiles(fetchedFiles);

      // Reconcile open files from storage
      const savedState = localStorage.getItem(getStorageKey(selectedProject));
      if (savedState) {
        try {
          const { openFileIds } = JSON.parse(savedState);
          const restoredFiles = fetchedFiles.filter(f => openFileIds.includes(f.id));
          setOpenFiles(restoredFiles);
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
        { id: '1', role: 'ai', content: `Environment initialized for Node [${selectedProject.slice(0, 8)}]. Local device state synchronized.`, timestamp: new Date() }
      ]);
    }
  }, [selectedProject]);

  useRealtime([
    {
      table: 'workspace_files',
      filter: selectedProject ? `project_id=eq.${selectedProject}` : undefined,
      onData: (payload) => {
        if (payload.eventType === 'INSERT') {
          setFiles((prev) => [...prev, payload.new as WorkspaceFile].sort((a, b) => a.path.localeCompare(b.path)));
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as WorkspaceFile;
          setFiles((prev) => prev.map((f) => f.id === updated.id ? updated : f));
          if (activeFileId === updated.id && updated.content !== code) {
             if (updated.updated_at !== activeFile?.updated_at) {
                setTerminalOutput(p => p + `[SYNC] Node ${updated.name} updated by cluster peer.\n`);
             }
          }
        } else if (payload.eventType === 'DELETE') {
          setFiles((prev) => prev.filter((f) => f.id !== payload.old.id));
          if (activeFileId === payload.old.id) {
             setOpenFiles(prev => prev.filter(f => f.id !== payload.old.id));
             setActiveFileId(null);
          }
        }
      },
    },
  ], [selectedProject, activeFileId, code]);

  const openFile = (f: WorkspaceFile) => {
    if (!openFiles.find(of => of.id === f.id)) {
      setOpenFiles([...openFiles, f]);
    }
    setActiveFileId(f.id);
    
    // Check for local draft first
    const draft = localStorage.getItem(getDraftKey(f.id));
    if (draft && draft !== f.content) {
      setCode(draft);
      toast.info(`Restored unsaved draft for ${f.name}`, { duration: 2000 });
    } else {
      setCode(f.content || '');
    }
    
    lastSavedContent.current = f.content || '';
    setTerminalOutput(p => p + `[SYSTEM] Context bound: ${f.name}\n`);
  };

  const closeFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newOpenFiles = openFiles.filter(f => f.id !== id);
    setOpenFiles(newOpenFiles);
    if (activeFileId === id) {
      const nextId = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].id : null;
      setActiveFileId(nextId);
      if (nextId) {
         const next = newOpenFiles.find(f => f.id === nextId);
         if (next) setCode(next.content);
      }
    }
    // Clean up draft if no changes
    if (localStorage.getItem(getDraftKey(id)) === files.find(f => f.id === id)?.content) {
      localStorage.removeItem(getDraftKey(id));
    }
  };

  const saveFile = async (contentToSave: string = code) => {
    if (!activeFileId) return;
    setSaving(true);
    const { error } = await supabase.from('workspace_files').update({ 
      content: contentToSave, 
      updated_at: new Date().toISOString() 
    }).eq('id', activeFileId);
    
    if (error) toast.error('Cluster sync error');
    else {
      lastSavedContent.current = contentToSave;
      localStorage.removeItem(getDraftKey(activeFileId));
      setTerminalOutput(p => p + `[SYSTEM] Resource ${activeFileId.slice(0, 6)} committed to cloud.\n`);
    }
    setSaving(false);
  };

  useEffect(() => {
    if (isAutoSync && activeFileId && code !== lastSavedContent.current) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => saveFile(code), 3000); // Higher delay for pro auto-sync
    }
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [code, isAutoSync, activeFileId]);

  const createFile = async () => {
    if (!selectedProject || !newFileName) return;
    const { error } = await supabase.from('workspace_files').insert({
      project_id: selectedProject,
      name: newFileName,
      path: `/${newFileName}`,
      content: '// Resource initialized...',
      language: newFileLang,
      created_by: profile?.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success('Resource deployed to cluster');
      setNewFileName('');
    }
  };

  const deleteFile = async (id: string) => {
    await supabase.from('workspace_files').delete().eq('id', id);
    localStorage.removeItem(getDraftKey(id));
    toast.success('Resource purged');
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalInput.trim().toLowerCase();
    if (!cmd) return;
    let out = `\n$ ${terminalInput}\n`;
    if (cmd === 'ls') out += files.map(f => f.name).join('  ');
    else if (cmd === 'clear') { setTerminalOutput(''); setTerminalInput(''); return; }
    else if (cmd === 'status') out += `Auto-Sync: ${isAutoSync ? 'READY' : 'OFF'}\nLocal Persistence: ACTIVE\nProject Bind: ${selectedProject}`;
    else out += `sh: command not found: ${cmd}`;
    setTerminalOutput(prev => prev + out + '\n');
    setTerminalInput('');
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] animate-in fade-in duration-700 bg-[#0d0f14] overflow-hidden rounded-2xl border border-white/5 shadow-2xl">
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        
        {/* LEFT PANEL: MANIFEST & TEAM */}
        <ResizablePanel defaultSize={18} minSize={12} maxSize={25} className="bg-[#161b22]/50 backdrop-blur-3xl border-r border-white/5 font-sans">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-white/5 bg-black/20">
              <div className="flex items-center justify-between mb-4">
                 <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                   <Folder className="w-3.5 h-3.5 text-primary" /> Manifest
                 </h2>
                 <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg hover:bg-primary/10 text-primary">
                        <FilePlus className="w-3.5 h-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1c2128] border-white/10 text-white shadow-2xl">
                      <DialogHeader><DialogTitle className="text-xs font-black uppercase tracking-[0.2em]">Deploy New Resource</DialogTitle></DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Resource Name</Label>
                          <Input value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="app.py" className="bg-black/40 border-white/10 h-10 text-xs font-mono focus:ring-1 focus:ring-primary" />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Language Class</Label>
                           <Select value={newFileLang} onValueChange={setNewFileLang}>
                             <SelectTrigger className="bg-black/40 border-white/10 h-10 text-xs font-mono"><SelectValue /></SelectTrigger>
                             <SelectContent className="bg-[#1c2128] border-white/10 text-white">
                               {['javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown'].map(l => (
                                 <SelectItem key={l} value={l} className="text-xs font-mono">{l}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                        </div>
                        <Button onClick={createFile} className="w-full h-10 gradient-primary text-primary-foreground font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">Execute Deployment</Button>
                      </div>
                    </DialogContent>
                 </Dialog>
              </div>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-full text-[10px] h-9 bg-black/40 border-white/5 hover:border-white/10 transition-colors font-black tracking-[0.1em] uppercase">
                  <SelectValue placeholder="Context Bind" />
                </SelectTrigger>
                <SelectContent className="bg-[#1c2128] border-white/10 text-white font-bold">
                  {projects.map((p) => <SelectItem key={p.id} value={p.id} className="text-[10px] uppercase font-black tracking-tighter">PROJECT_{p.id.slice(0, 12)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="flex-1">
              <div className="py-2">
                <div className="px-4 mb-2">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Local Resources</span>
                </div>
                {files.map((f) => {
                  const hasDraft = localStorage.getItem(getDraftKey(f.id)) !== null;
                  return (
                    <div
                      key={f.id}
                      className={`flex items-center gap-2.5 px-4 h-10 cursor-pointer text-[12px] group transition-all ${activeFileId === f.id ? 'bg-primary/10 text-primary border-r-2 border-primary' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
                      onClick={() => openFile(f)}
                    >
                      <FileCode className={`w-3.5 h-3.5 shrink-0 ${activeFileId === f.id ? 'text-primary' : 'text-slate-600'}`} />
                      <span className="truncate flex-1 font-medium italic tracking-tight">{f.name}</span>
                      {hasDraft && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse border border-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.5)]" />}
                      <button onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-400 transition-opacity">
                         <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-white/5 bg-black/20">
               <div className="mb-4">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Neural Presence</span>
                  <div className="flex -space-x-2">
                    {teamMembers.map((m) => (
                      <TooltipProvider key={m.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="w-7 h-7 rounded-full border-2 border-[#0d0f14] bg-slate-800 flex items-center justify-center overflow-hidden hover:-translate-y-1 transition-transform ring-1 ring-white/10 shadow-lg">
                              {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" /> : <span className="text-[9px] font-bold">{m.name.charAt(0)}</span>}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-[9px] border-white/10 uppercase font-black tracking-widest shadow-2xl">{m.name} — {m.role}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
               </div>
               <div className="flex items-center justify-between text-[9px] font-black mb-1 tracking-widest">
                  <span className="text-slate-600 flex items-center gap-1.5"><Database className="w-3 h-3" /> PERSIST_CACHE</span>
                  <span className="text-primary animate-pulse italic">STABLE</span>
               </div>
               <div className="h-0.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-full animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
               </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-white/5 hover:bg-primary/20 transition-colors" />

        {/* CENTER PANEL: TABS, EDITOR & CONSOLE */}
        <ResizablePanel defaultSize={60} minSize={30} className="bg-[#0b0c10] flex flex-col">
          <div className="flex-1 flex flex-col min-w-0 h-full">
            {/* Tab Bar */}
            <div className="flex bg-[#161b22]/80 backdrop-blur-md border-b border-white/5 overflow-x-auto scrollbar-hide">
              {openFiles.map(f => {
                const hasDraft = localStorage.getItem(getDraftKey(f.id)) !== null;
                return (
                  <div
                    key={f.id}
                    onClick={() => openFile(f)}
                    className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer text-[11px] font-bold border-r border-white/5 transition-all min-w-[140px] max-w-[200px] group ${activeFileId === f.id ? 'bg-[#0b0c10] text-primary border-t-2 border-primary shadow-2xl' : 'text-slate-600 hover:bg-[#1c2128] hover:text-slate-400'}`}
                  >
                    <FileCode className={`w-3.5 h-3.5 ${activeFileId === f.id ? 'text-primary' : 'text-slate-600'}`} />
                    <span className="truncate flex-1 tracking-tight italic">{f.name}</span>
                    {hasDraft && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                    <X 
                      className="w-3 h-3 text-slate-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" 
                      onClick={(e) => closeFile(f.id, e)}
                    />
                  </div>
                );
              })}
              {openFiles.length === 0 && <div className="px-4 py-2.5 text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] italic">Awaiting Module Binding...</div>}
            </div>

            <div className="flex-1 relative">
              {activeFileId ? (
                <>
                  <div className="absolute top-4 right-8 z-30 flex items-center gap-3">
                     <Badge variant="outline" className={`h-6 px-3 text-[9px] font-black tracking-[0.2em] border-primary/20 bg-black/60 backdrop-blur-xl cursor-pointer hover:bg-primary/5 transition-all shadow-2xl ${isAutoSync ? 'text-primary' : 'text-slate-600 opacity-50'}`} onClick={() => setIsAutoSync(!isAutoSync)}>
                        PERSIST_{isAutoSync ? 'ON' : 'OFF'}
                     </Badge>
                     <Button size="sm" className={`h-7 px-4 text-[9px] font-black uppercase tracking-[0.2em] gradient-primary text-primary-foreground shadow-2xl transition-all ${saving ? 'opacity-50 scale-95' : 'hover:scale-105 active:scale-95'}`} onClick={() => saveFile(code)} disabled={saving}>
                        {saving ? <Zap className="w-3 h-3 mr-2 animate-spin" /> : <Save className="w-3 h-3 mr-2" />}
                        Commit
                     </Button>
                  </div>
                  <Editor
                    height="100%"
                    language={activeFile?.language}
                    value={code}
                    onChange={(val) => setCode(val || '')}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: true, scale: 0.8, side: 'right' },
                      fontSize: 15,
                      lineNumbers: 'on',
                      automaticLayout: true,
                      padding: { top: 24, bottom: 24 },
                      scrollBeyondLastLine: false,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      cursorStyle: 'line-thin',
                      smoothScrolling: true,
                      bracketPairColorization: { enabled: true },
                      fontLigatures: true,
                      renderWhitespace: 'none',
                      renderControlCharacters: false,
                      wordWrap: 'on',
                    }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 bg-[#0b0c10] gap-6">
                   <div className="w-20 h-20 rounded-3xl bg-slate-900 flex items-center justify-center border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-pulse">
                      <Zap className="w-10 h-10 opacity-10" />
                   </div>
                   <div className="text-center space-y-2">
                     <h2 className="text-[10px] font-black uppercase tracking-[0.5em] italic text-slate-600">No Active Module Binding</h2>
                     <p className="text-[9px] font-bold text-slate-800 uppercase tracking-widest">Hydrate a resource from the manifest to begin engineering</p>
                   </div>
                </div>
              )}
            </div>

            {/* INTEGRATED TERMINAL */}
            {isConsoleOpen && (
              <div className="h-48 bg-[#050608] border-t border-white/5 flex flex-col font-mono shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                <div className="px-4 py-1.5 bg-black/40 border-b border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-4 text-[9px] font-black uppercase text-slate-500 tracking-widest">
                      <span className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-primary" /> Kernel_Log_v2.4</span>
                      <span className="text-emerald-500/80 flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Cluster: Online</span>
                   </div>
                   <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/5 text-slate-600 hover:text-white" onClick={() => setIsConsoleOpen(false)}>
                      <X className="w-3 h-3" />
                   </Button>
                </div>
                <ScrollArea className="flex-1 p-4 bg-[radial-gradient(circle_at_bottom_right,rgba(var(--primary),0.02)_0%,transparent_70%)]">
                   <div className="text-[11px] text-emerald-400/80 whitespace-pre-wrap leading-relaxed italic opacity-80">
                      {terminalOutput}
                   </div>
                   <form onSubmit={handleTerminalSubmit} className="flex items-center mt-2 group">
                      <span className="text-primary mr-3 font-black text-[11px] tracking-tight">shell@node [~] %</span>
                      <input 
                        className="bg-transparent border-none outline-none flex-1 text-emerald-400 placeholder:opacity-10 text-[11px] caret-white" 
                        value={terminalInput}
                        onChange={(e) => setTerminalInput(e.target.value)}
                        placeholder="execute_kernel_instruction..."
                        autoComplete="off"
                        spellCheck={false}
                      />
                   </form>
                </ScrollArea>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-white/5 hover:bg-primary/20 transition-colors" />

        {/* RIGHT PANEL: CO-PILOT AI */}
        <ResizablePanel defaultSize={22} minSize={15} maxSize={30} className="bg-[#161b22]/40 backdrop-blur-3xl border-l border-white/5 flex flex-col">
           <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                 <Sparkles className="w-3.5 h-3.5 text-primary" /> Co-Pilot
              </h2>
              <Badge variant="outline" className="text-[8px] border-primary/20 text-primary uppercase font-black px-1.5 h-4 tracking-tighter shadow-lg bg-primary/5">Intelligence Online</Badge>
           </div>
           
           <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                 {chatMessages.map(m => (
                   <div key={m.id} className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center gap-2">
                         <div className={`p-1.5 rounded-lg ${m.role === 'ai' ? 'bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5' : 'bg-slate-800 border-white/5 shadow-md'}`}>
                            {m.role === 'ai' ? <Cpu className="w-3.5 h-3.5 text-primary" /> : <Users className="w-3.5 h-3.5 text-slate-500" />}
                         </div>
                         <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                            {m.role === 'ai' ? 'Core_System' : 'Lead_Eng'}
                         </span>
                         <span className="text-[8px] text-slate-800 font-bold ml-auto">{formatDistanceToNow(m.timestamp, { addSuffix: true })}</span>
                      </div>
                      <div className={`text-[11px] leading-relaxed p-4 rounded-2xl border ${m.role === 'ai' ? 'bg-primary/5 text-slate-300 border-primary/10 shadow-inner italic' : 'bg-slate-900/50 text-slate-400 border-white/5'}`}>
                         {m.content}
                      </div>
                   </div>
                 ))}
                 <div ref={chatEndRef} />
              </div>
           </ScrollArea>

           <div className="p-4 bg-black/20 border-t border-white/5">
              <div className="grid grid-cols-2 gap-2 mb-4">
                 <Button variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest border-white/5 hover:bg-primary/5 hover:text-primary transition-all group rounded-xl">
                    <Code2 className="w-3.5 h-3.5 mr-2 text-slate-600 group-hover:text-primary transition-colors" /> Refactor
                 </Button>
                 <Button variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest border-white/5 hover:bg-primary/5 hover:text-primary transition-all group rounded-xl">
                    <Bug className="w-3.5 h-3.5 mr-2 text-slate-600 group-hover:text-primary transition-colors" /> Debug
                 </Button>
              </div>
              <div className="relative group">
                 <div className="absolute inset-0 bg-primary/10 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700 pointer-events-none" />
                 <textarea 
                    placeholder="Inquire AI Cluster Assistance..." 
                    className="w-full bg-[#1c2128] border border-white/10 rounded-2xl px-4 py-3.5 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary h-28 resize-none transition-all relative shadow-2xl scrollbar-hide"
                 />
                 <Button size="icon" className="absolute bottom-3 right-3 h-9 w-9 rounded-xl gradient-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:scale-110 active:scale-90 transition-all">
                    <Send className="w-4 h-4" />
                 </Button>
              </div>
           </div>
        </ResizablePanel>

      </ResizablePanelGroup>

      {/* FOOTER STATUS BAR */}
      {!isConsoleOpen && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-primary flex items-center px-4 justify-between text-[10px] font-black uppercase text-primary-foreground tracking-[0.2em] cursor-pointer group shadow-[0_-10px_30px_rgba(var(--primary),0.3)] hover:bg-primary/95 transition-all" onClick={() => setIsConsoleOpen(true)}>
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 animate-in slide-in-from-left-2"><PanelsLeftBottom className="w-4 h-4" /> Operational Console</div>
              <div className="flex items-center gap-2 opacity-60"><Activity className="w-3.5 h-3.5" /> Node: Primary_Cluster</div>
           </div>
           <div className="flex items-center gap-4">
              <span className="opacity-60 italic">Persistent Local Storage: ACTIVE</span>
              <div className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse shadow-[0_0_10px_white]" />
           </div>
        </div>
      )}
    </div>
  );
}
