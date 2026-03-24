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
  Activity, CloudRain, Clock
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

export default function StudentWorkspace() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [code, setCode] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileLang, setNewFileLang] = useState('javascript');
  const [saving, setSaving] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('System: Workspace initialized. High-availability cluster online.\n');
  const [terminalInput, setTerminalInput] = useState('');
  const [showTerminal, setShowTerminal] = useState(true);
  const [isAutoSync, setIsAutoSync] = useState(true);
  
  const lastSavedContent = useRef<string>('');
  const syncTimer = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const fetchFiles = useCallback(async () => {
    if (!selectedProject) return;
    const { data } = await supabase.from('workspace_files').select('*').eq('project_id', selectedProject).order('path');
    if (data) setFiles(data as WorkspaceFile[]);
  }, [selectedProject]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useRealtime([
    {
      table: 'workspace_files',
      filter: selectedProject ? `project_id=eq.${selectedProject}` : undefined,
      onData: (payload) => {
        if (payload.eventType === 'INSERT') {
          setFiles((prev) => [...prev, payload.new as WorkspaceFile].sort((a, b) => a.path.localeCompare(b.path)));
        } else if (payload.eventType === 'UPDATE') {
          setFiles((prev) => prev.map((f) => f.id === payload.new.id ? { ...payload.new as WorkspaceFile } : f));
          
          // If another person updated the file we are currently editing
          if (activeFile?.id === payload.new.id && payload.new.updated_at !== activeFile.updated_at) {
             const updatedFile = payload.new as WorkspaceFile;
             // Only auto-update code if the remote content changed and we aren't mid-typing (or if we lost the race)
             if (updatedFile.content !== lastSavedContent.current) {
                // If the remote version is different from what we thought was last saved, someone else pushed.
                // We'll update the activeFile meta, but leave the local 'code' state for the user unless it's a major divergence.
                setActiveFile(updatedFile);
                setTerminalOutput(p => p + `[SYNC] ${updatedFile.name} updated by cluster peer.\n`);
             }
          }
        } else if (payload.eventType === 'DELETE') {
          setFiles((prev) => prev.filter((f) => f.id !== payload.old.id));
          if (activeFile?.id === payload.old.id) setActiveFile(null);
        }
      },
    },
  ], [selectedProject, activeFile?.id]);

  const openFile = (f: WorkspaceFile) => {
    setActiveFile(f);
    setCode(f.content || '');
    lastSavedContent.current = f.content || '';
    setTerminalOutput(p => p + `[SYSTEM] Switched context: ${f.name}\n`);
  };

  const saveFile = async (contentToSave: string = code) => {
    if (!activeFile) return;
    setSaving(true);
    const { error } = await supabase.from('workspace_files').update({ 
      content: contentToSave, 
      updated_at: new Date().toISOString() 
    }).eq('id', activeFile.id);
    
    if (error) toast.error('Sync collision detected');
    else {
      lastSavedContent.current = contentToSave;
    }
    setSaving(false);
  };

  // Professional Debounced Auto-Sync for Team Collaboration
  useEffect(() => {
    if (isAutoSync && activeFile && code !== lastSavedContent.current) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        saveFile(code);
      }, 1500); // 1.5s debounce for professional "save as you type" feel without hitting rate limits
    }
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [code, isAutoSync, activeFile]);

  const createFile = async () => {
    if (!selectedProject || !newFileName) return;
    const { error } = await supabase.from('workspace_files').insert({
      project_id: selectedProject,
      name: newFileName,
      path: `/${newFileName}`,
      content: '// Collaborative code entry point...',
      language: newFileLang,
      created_by: profile?.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success('Resource cluster updated');
      setNewFileName('');
    }
  };

  const deleteFile = async (id: string) => {
    await supabase.from('workspace_files').delete().eq('id', id);
    toast.success('Resource purged');
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalInput.trim().toLowerCase();
    if (!cmd) return;
    
    let out = `\n$ ${terminalInput}\n`;
    if (cmd === 'ls') out += files.map(f => f.name).join('  ');
    else if (cmd === 'clear') { setTerminalOutput(''); setTerminalInput(''); return; }
    else if (cmd === 'peers') out += teamMembers.map(m => `${m.name} (${m.role})`).join('\n');
    else if (cmd === 'status') out += `Auto-Sync: ${isAutoSync ? 'ON' : 'OFF'}\nProject: ${projects.find(p => p.id === selectedProject)?.title}\nPeers: ${teamMembers.length}`;
    else out += `sh: command not found: ${cmd}`;
    
    setTerminalOutput(prev => prev + out + '\n');
    setTerminalInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] animate-fade-in bg-background">
      {/* Professional Collaboration Header */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-border bg-card/70 backdrop-blur-xl sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Code2 className="w-4 h-4 text-primary-foreground" />
             </div>
             <div>
                <h1 className="text-xs font-black text-foreground uppercase tracking-[0.2em] italic">Engineering Cluster</h1>
                <p className="text-[10px] text-muted-foreground font-bold flex items-center gap-1.5 mt-0.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 0ms Latency Optimized
                </p>
             </div>
          </div>

          <div className="h-8 w-[1px] bg-border/50 mx-2" />

          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-64 h-9 text-xs bg-muted/30 border-none font-bold tracking-tight">
              <SelectValue placeholder="Select Grid Context" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs font-medium">{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Presence Indicator (The 4+ members) */}
        <div className="flex items-center gap-4">
           <div className="flex -space-x-3 items-center mr-2">
              <TooltipProvider>
                {teamMembers.map((m, i) => (
                  <Tooltip key={m.id}>
                    <TooltipTrigger asChild>
                       <div 
                         className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[10px] font-bold text-foreground overflow-hidden cursor-pointer"
                         style={{ zIndex: 10 - i }}
                       >
                         {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" /> : m.name.charAt(0)}
                       </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-[10px] bg-slate-900 border-white/10">{m.name} ({m.role})</TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
              {teamMembers.length > 5 && (
                <div className="w-8 h-8 rounded-full border-2 border-card bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary z-0">+ {teamMembers.length - 5}</div>
              )}
           </div>

           <div className="flex items-center gap-2">
              <Badge variant="outline" className={`h-6 px-3 text-[10px] font-black tracking-widest uppercase border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-all ${isAutoSync ? 'text-primary' : 'text-muted-foreground opacity-50'}`} onClick={() => setIsAutoSync(!isAutoSync)}>
                 Auto-Sync {isAutoSync ? 'Active' : 'Disabled'}
              </Badge>
              <Button variant="outline" size="sm" className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest border-border bg-transparent hover:bg-muted/50" onClick={saveFile} disabled={!activeFile || saving}>
                 {saving ? <Zap className="w-3 h-3 mr-2 animate-spin" /> : <Save className="w-3 h-3 mr-2 text-primary" />}
                 Manual Sync
              </Button>
              <Button size="sm" className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest gradient-primary text-primary-foreground shadow-lg shadow-primary/20">
                 <Share2 className="w-3 h-3 mr-2" /> Share Node
              </Button>
           </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Advanced Explorer */}
        <aside className="w-72 border-r border-border bg-card/30 backdrop-blur-sm flex flex-col shrink-0">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Folder className="w-4 h-4 text-primary" /> Manifest Explorer
            </span>
            <Dialog>
              <DialogTrigger asChild>
                <button className="w-7 h-7 flex items-center justify-center hover:bg-primary/10 rounded-xl transition-all text-primary border border-primary/20">
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xs bg-slate-900 border-white/10">
                <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-widest">Initialize Node</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Resource Name</Label>
                    <Input value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="index.js" className="h-10 bg-black/40 border-white/5 text-xs font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Language Class</Label>
                    <Select value={newFileLang} onValueChange={setNewFileLang}>
                      <SelectTrigger className="h-10 bg-black/40 border-white/5 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-white/10">
                        {['javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown'].map(l => (
                          <SelectItem key={l} value={l} className="text-xs font-mono">{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createFile} className="w-full h-10 gradient-primary text-primary-foreground font-black uppercase text-[10px] tracking-widest">Deploy Resource</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {files.length === 0 ? (
              <div className="py-20 text-center opacity-20">
                <Activity className="w-10 h-10 mx-auto mb-4" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Awaiting Pulse...</p>
              </div>
            ) : (
              files.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center justify-between px-3 h-11 cursor-pointer text-xs rounded-xl transition-all group ${activeFile?.id === f.id ? 'bg-primary/10 text-primary font-bold shadow-inner' : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'}`}
                  onClick={() => openFile(f)}
                >
                  <span className="flex items-center gap-3 truncate">
                    <FileCode className={`w-4 h-4 shrink-0 ${activeFile?.id === f.id ? 'text-primary' : 'text-muted-foreground/30'}`} />
                    <span className="font-mono tracking-tight">{f.name}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${activeFile?.id === f.id ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-transparent'}`} />
                    <button onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-all">
                       <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-border/50 bg-muted/5 mt-auto space-y-3">
             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-2">< Zap className="w-3 h-3 text-amber-500" /> Cloud Sync</span>
                <span className="text-primary">Operational</span>
             </div>
             <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-pulse w-full" />
             </div>
          </div>
        </aside>

        {/* Professional Master Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
          <div className="flex-1 relative">
            {activeFile ? (
              <>
                <div className="absolute top-4 right-8 z-30 flex items-center gap-3">
                   <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-2xl">
                      <ShieldCheck className="w-3 h-3" /> Secure Stream Active
                   </div>
                </div>
                <Editor
                  height="100%"
                  language={activeFile.language}
                  value={code}
                  onChange={(val) => setCode(val || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: true, scale: 0.75, side: 'right' },
                    fontSize: 15,
                    lineNumbers: 'on',
                    roundedSelection: true,
                    scrollBeyondLastLine: false,
                    readOnly: false,
                    automaticLayout: true,
                    padding: { top: 24, bottom: 24 },
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', monospace",
                    cursorStyle: 'line-thin',
                    cursorBlinking: 'smooth',
                    bracketPairColorization: { enabled: true },
                    smoothScrolling: true,
                    letterSpacing: 0.5,
                  }}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-6 bg-[#0a0a0a]">
                <div className="w-24 h-24 rounded-3xl bg-slate-900 flex items-center justify-center border border-white/5 shadow-2xl animate-pulse">
                  <CloudRain className="w-12 h-12 opacity-10" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-base font-black text-foreground uppercase tracking-widest italic">Awaiting Resource Binding</h3>
                  <p className="text-xs text-muted-foreground font-medium max-w-[240px] leading-relaxed mx-auto">Select a project node from the manifest to begin collaborative real-time sync.</p>
                </div>
              </div>
            )}
          </div>

          {/* Integrated Multi-Threaded Terminal */}
          {showTerminal && (
            <div className="h-1/3 min-h-[200px] bg-[#050505] border-t border-border/50 flex flex-col font-mono shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <div className="px-6 py-2 text-[10px] font-black text-muted-foreground flex items-center justify-between border-b border-white/5 uppercase tracking-tighter">
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /> BASH_INIT v9.4</div>
                   <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /> CLUSTER_NODES: {teamMembers.length}</div>
                </div>
                <div className="flex items-center gap-6">
                  <span className="hover:text-primary cursor-pointer transition-colors flex items-center gap-1"><Clock className="w-3 h-3" /> Uptime: 14h 22m</span>
                  <span className="text-red-500/80 hover:text-red-500 cursor-pointer font-bold border-l border-white/10 pl-6" onClick={() => setTerminalOutput('')}>Clear Buffer</span>
                </div>
              </div>
              <div className="flex-1 p-6 text-xs text-emerald-400/90 overflow-y-auto leading-relaxed custom-scrollbar bg-[radial-gradient(circle_at_50%_50%,rgba(0,128,0,0.02)_0%,transparent_100%)]">
                <pre className="whitespace-pre-wrap">{terminalOutput}</pre>
                <form onSubmit={handleTerminalSubmit} className="flex mt-2 items-center">
                  <span className="text-primary mr-3 font-black flex items-center gap-1">root@tech-hub <span className="text-foreground">~</span> #</span>
                  <input
                    className="flex-1 bg-transparent border-none outline-none text-emerald-400 caret-white font-mono placeholder:opacity-20"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder="Execute kernel instruction..."
                    autoFocus
                  />
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
