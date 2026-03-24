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
  Terminal as TerminalIcon
} from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { formatDistanceToNow } from 'date-fns';
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

export default function CompanyWorkspace() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

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
    if (data) setFiles(data as WorkspaceFile[]);
  }, [selectedProject]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchTeam(); }, [fetchTeam]);
  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useRealtime([
    {
      table: 'workspace_files',
      filter: selectedProject ? `project_id=eq.${selectedProject}` : undefined,
      onData: () => fetchFiles(),
    },
  ], [selectedProject]);

  const openFile = (f: WorkspaceFile) => {
    setActiveFile(f);
    setAuditLogs(prev => [
      { id: Date.now(), user: profile?.name || 'Admin', action: 'Accessed', target: f.name, time: new Date().toISOString() },
      ...prev.slice(0, 15)
    ]);
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] animate-fade-in gap-6 bg-background/50">
      {/* Executive Auditor Sidebar */}
      <div className="w-80 flex flex-col gap-6 shrink-0">
        <Card className="shadow-elevated border-none bg-card/60 backdrop-blur-xl overflow-hidden flex flex-col flex-1 border border-white/5">
          <CardHeader className="p-6 border-b border-border bg-muted/20">
             <div className="flex items-center justify-between mb-4">
               <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <Shield className="w-4 h-4 text-primary" /> Oversight Console
               </CardTitle>
               <Badge variant="outline" className="text-[9px] py-0 border-primary/20 text-primary">Live</Badge>
             </div>
             <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-full text-xs h-10 bg-background/50 border-none font-bold">
                <SelectValue placeholder="Entity Scope" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                {projects.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs font-semibold">{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
            <div>
               <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 pl-2">Active Engineering Team</h4>
               <div className="flex flex-wrap gap-2.5">
                  <TooltipProvider>
                    {teamMembers.map((m) => (
                      <Tooltip key={m.id}>
                        <TooltipTrigger asChild>
                           <div className="w-10 h-10 rounded-2xl bg-muted border border-white/5 flex items-center justify-center overflow-hidden cursor-crosshair hover:scale-110 transition-transform">
                              {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" /> : <span className="text-xs font-black">{m.name.charAt(0)}</span>}
                           </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-[10px] bg-black border-white/5">{m.name} — {m.role}</TooltipContent>
                      </Tooltip>
                    ))}
                  </TooltipProvider>
               </div>
            </div>

            <Separator className="bg-border/50" />

            <div>
              <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 pl-2">System Resources</h4>
              <div className="space-y-1">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer text-xs rounded-xl transition-all group ${activeFile?.id === f.id ? 'bg-primary/10 text-primary font-black shadow-inner' : 'text-muted-foreground hover:bg-muted/10 hover:text-foreground'}`}
                    onClick={() => openFile(f)}
                  >
                    <FileCode className={`w-4 h-4 shrink-0 ${activeFile?.id === f.id ? 'text-primary' : 'text-muted-foreground/30'}`} />
                    <span className="truncate mono tracking-tight">{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-border bg-muted/20 space-y-4 font-bold uppercase tracking-widest text-[10px]">
             <div className="flex justify-between items-center"><span className="text-muted-foreground">Resource Load</span><span className="text-primary">L-04 Pulse</span></div>
             <div className="h-1 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary animate-pulse w-3/4" /></div>
          </div>
        </Card>
      </div>

      {/* Primary Observer Plane */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 shadow-elevated border-none bg-card flex flex-col overflow-hidden border border-white/5">
          <CardHeader className="p-4 border-b border-border bg-muted/10 flex flex-row items-center justify-between">
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2 font-mono text-[9px] font-black text-emerald-400 uppercase tracking-tighter">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" /> Real-Time Auditor Plane
               </div>
               {activeFile && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                     <Clock className="w-3 h-3" /> Last Active: {formatDistanceToNow(new Date(activeFile.updated_at), { addSuffix: true })}
                  </div>
               )}
            </div>
            <div className="flex items-center gap-2">
               <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest border-border hover:bg-muted"><MessageCircle className="w-3.5 h-3.5 mr-2" /> Open Channel</Button>
               <Button size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest gradient-primary text-primary-foreground"><BarChart2 className="w-3.5 h-3.5 mr-2" /> Core Metrics</Button>
            </div>
          </CardHeader>
          <div className="flex-1 relative bg-[#1e1e1e]">
            {activeFile ? (
              <>
                <div className="absolute top-6 left-12 z-20 pointer-events-none opacity-20">
                   <ShieldAlert className="w-32 h-32 text-primary" />
                </div>
                <Editor
                  height="100%"
                  language={activeFile.language}
                  value={activeFile.content}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: true, side: 'right' },
                    fontSize: 15,
                    lineNumbers: 'on',
                    automaticLayout: true,
                    padding: { top: 24, bottom: 24 },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    smoothScrolling: true,
                    cursorStyle: 'block',
                  }}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-[#0a0a0a] gap-4">
                 <div className="w-20 h-20 rounded-full border border-dashed border-white/5 flex items-center justify-center bg-muted/5">
                   <Eye className="w-8 h-8 opacity-20" />
                 </div>
                 <h2 className="text-xs font-black uppercase tracking-[0.3em] italic text-center">Awaiting System Broadcast</h2>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Intelligence & Audit Feed */}
      <div className="w-80 flex flex-col gap-6 shrink-0">
         <Card className="flex-1 shadow-elevated border-none bg-card/60 backdrop-blur-xl overflow-hidden flex flex-col border border-white/5">
            <CardHeader className="p-6 border-b border-border bg-muted/20">
               <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <History className="w-4 h-4 text-primary" /> Entity Intelligence
               </CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
               <div className="space-y-4">
                 {auditLogs.length === 0 ? (
                    <div className="py-20 text-center opacity-20 space-y-3">
                       <TerminalIcon className="w-8 h-8 mx-auto" />
                       <p className="text-[10px] uppercase font-black">Waiting for Data Stream</p>
                    </div>
                 ) : (
                    auditLogs.map(log => (
                       <div key={log.id} className="relative pl-5 border-l-2 border-primary/20 pb-2">
                          <div className="absolute -left-[6px] top-1 w-2.5 h-2.5 rounded-full bg-primary shadow-lg shadow-primary/50" />
                          <p className="text-[10px] font-black text-foreground leading-tight uppercase tracking-tight">{log.action} <span className="text-primary italic">{log.target}</span></p>
                          <p className="text-[9px] text-muted-foreground mt-2 font-bold uppercase flex justify-between">
                             <span>ID: {log.user.slice(0, 8)}</span>
                             <span>{formatDistanceToNow(new Date(log.time), { addSuffix: true })}</span>
                          </p>
                       </div>
                    ))
                 )}
               </div>

               <Separator className="bg-border/50" />

               <div className="p-5 rounded-3xl bg-primary/5 border border-primary/10 space-y-3">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Auditor Insight</p>
                  <p className="text-xs font-medium leading-relaxed italic">"Live pulse detected. The engineering team is currently concentrating on root resource modifications."</p>
               </div>
            </div>
            
            <div className="p-6 bg-slate-900 mt-auto">
               <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary h-10 border border-white/5">Export Audit Master</Button>
            </div>
         </Card>
      </div>
    </div>
  );
}

const Separator = ({ className }: { className?: string }) => <div className={`h-[1px] w-full ${className}`} />;
