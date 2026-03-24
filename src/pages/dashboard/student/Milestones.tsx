import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Plus, CheckCircle, XCircle, AlertCircle, Clock, Calendar, Upload, ExternalLink } from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { sendNotification } from '@/lib/notifications';
import { formatDistanceToNow, isPast } from 'date-fns';

type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

const statusConfig: Record<MilestoneStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Upcoming', color: 'bg-slate-500/15 text-slate-400 border-slate-500/20', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: AlertCircle },
  submitted: { label: 'Submitted', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: Upload },
  approved: { label: 'Completed', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
  rejected: { label: 'Needs Revision', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: XCircle },
};

function getProgress(milestones: any[]) {
  if (!milestones.length) return 0;
  const done = milestones.filter((m) => m.status === 'approved').length;
  return Math.round((done / milestones.length) * 100);
}

export default function StudentMilestones() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<Record<string, any[]>>({});
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitLink, setSubmitLink] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    const { data: leaderTeams } = await supabase.from('teams').select('project_id, projects(*)').eq('leader_id', profile.id);
    const { data: memberTeams } = await supabase.from('team_members').select('teams!inner(project_id, projects(*))').eq('user_id', profile.id);
    
    const projs: any[] = [];
    const seen = new Set<string>();
    const addProject = (p: any) => { if (p && !seen.has(p.id)) { seen.add(p.id); projs.push(p); } };
    leaderTeams?.forEach((t: any) => addProject(t.projects));
    memberTeams?.forEach((m: any) => addProject((m.teams as any)?.projects));
    setProjects(projs);

    const ms: Record<string, any[]> = {};
    await Promise.all(projs.map(async (p) => {
      const { data } = await supabase.from('milestones').select('*, deliverables(*)').eq('project_id', p.id).order('created_at');
      if (data) ms[p.id] = data;
    }));
    setMilestones(ms);
  }, [profile]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useRealtime([{ table: 'milestones', onData: () => fetchAll() }], [profile?.id]);

  const addMilestone = async () => {
    if (!selectedProject || !newTitle.trim()) { toast.error('Title is required'); return; }
    const { error } = await supabase.from('milestones').insert({
      project_id: selectedProject,
      title: newTitle,
      description: newDesc,
      deadline: newDeadline || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Milestone added');
    setNewTitle(''); setNewDesc(''); setNewDeadline('');
    setDialogOpen(false);
    fetchAll();
  };

  const updateStatus = async (milestone: any, status: MilestoneStatus, extra?: { submission_link?: string }) => {
    setUpdating(milestone.id);
    // Update milestone
    const { error } = await supabase.from('milestones').update({ status }).eq('id', milestone.id);
    if (error) { toast.error(error.message); setUpdating(null); return; }

    // Logic for submission
    if (status === 'submitted' && extra?.submission_link) {
      await supabase.from('deliverables').upsert({
        milestone_id: milestone.id,
        submission_link: extra.submission_link,
        status: 'submitted',
        submitted_by: profile?.id,
      });
      // Notify company
      const project = projects.find((p) => p.id === milestone.project_id);
      if (project) {
        await sendNotification(project.company_id, 'Milestone Submitted', `Milestone "${milestone.title}" has been submitted for review on "${project.title}"`, 'info');
      }
    }

    toast.success(`Milestone ${status.replace('_', ' ')}`);
    setSubmitLink('');
    setUpdating(null);
    fetchAll();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Milestones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and submit your project deliverables</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center border-dashed">
          <CheckCircle className="w-12 h-12 text-muted-foreground/20 mb-4" />
          <h3 className="font-semibold text-foreground">No Active Projects</h3>
          <p className="text-muted-foreground text-sm max-w-xs mt-1">Once you win a bid and start a project, you can manage your milestones here.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          {projects.map((p) => {
            const pMilestones = milestones[p.id] || [];
            const progress = getProgress(pMilestones);

            return (
              <Card key={p.id} className="shadow-card border-l-4 border-l-primary">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base truncate">{p.title}</CardTitle>
                        <Badge variant="outline" className="text-[10px] py-0 px-2 h-5 font-normal">Team Lead</Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex-1 max-w-[240px]">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                            <span>Project Progress</span>
                            <span className="font-medium text-foreground">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>
                      </div>
                    </div>
                    <Dialog open={dialogOpen && selectedProject === p.id} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedProject(p.id); setDialogOpen(true); }}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Milestone
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Create New Milestone</DialogTitle></DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2"><Label htmlFor="m-title">Title *</Label><Input id="m-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Initial Backend Setup" /></div>
                          <div className="space-y-2"><Label htmlFor="m-desc">Requirements & Description</Label><Textarea id="m-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Describe exactly what will be delivered..." rows={3} /></div>
                          <div className="space-y-2"><Label htmlFor="m-date">Deadline</Label><Input id="m-date" type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} /></div>
                          <Button onClick={addMilestone} className="w-full gradient-primary text-primary-foreground">Confirm Milestone</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {pMilestones.length === 0 ? (
                      <div className="p-8 text-center bg-muted/10">
                        <p className="text-xs text-muted-foreground">No milestones defined for this project yet.</p>
                      </div>
                    ) : (
                      pMilestones.map((m) => {
                        const { color, icon: Icon, label } = statusConfig[m.status as MilestoneStatus] || statusConfig.pending;
                        const overdue = m.deadline && isPast(new Date(m.deadline)) && m.status !== 'approved';
                        const deliverable = m.deliverables?.[0];

                        return (
                          <div key={m.id} className="group flex items-start gap-4 p-5 hover:bg-muted/20 transition-colors">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${color}`}>
                              <Icon className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="text-sm font-semibold text-foreground truncate">{m.title}</h4>
                                <Badge variant="secondary" className={`text-[10px] py-0 border ${color}`}>{label}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{m.description || 'No description provided.'}</p>
                              <div className="flex items-center gap-4 text-[10px] font-medium uppercase tracking-wider">
                                {m.deadline && (
                                  <span className={`flex items-center gap-1 ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    <Calendar className="w-3 h-3" />
                                    {overdue ? 'Overdue: ' : 'Due: '}
                                    {new Date(m.deadline).toLocaleDateString()}
                                  </span>
                                )}
                                {deliverable?.submission_link && (
                                  <a href={deliverable.submission_link} target="_blank" rel="noopener" className="flex items-center gap-1 text-primary hover:underline">
                                    <ExternalLink className="w-3 h-3" />
                                    View Submission
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-center">
                              {m.status === 'pending' && (
                                <Button size="sm" variant="secondary" className="h-8" onClick={() => updateStatus(m, 'in_progress')}>
                                  Start Task
                                </Button>
                              )}
                              {(m.status === 'in_progress' || m.status === 'rejected') && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" className="h-8 gradient-primary text-primary-foreground font-semibold">
                                      <Upload className="w-3.5 h-3.5 mr-1.5" /> Submit Work
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader><DialogTitle>Submit Deliverable</DialogTitle></DialogHeader>
                                    <div className="space-y-4 pt-2">
                                      <div className="p-3 bg-muted/30 rounded-lg border border-border">
                                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Task</p>
                                        <p className="text-sm font-medium">{m.title}</p>
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Artifact Link (GitHub, Figma, URL) *</Label>
                                        <Input
                                          value={submitLink}
                                          onChange={(e) => setSubmitLink(e.target.value)}
                                          placeholder="https://github.com/ulavesh/project-x"
                                        />
                                        <p className="text-[10px] text-muted-foreground">The project manager will use this link to review your work.</p>
                                      </div>
                                      <Button
                                        onClick={() => updateStatus(m, 'submitted', { submission_link: submitLink })}
                                        disabled={!submitLink || !!updating}
                                        className="w-full gradient-primary text-primary-foreground h-11"
                                      >
                                        {updating === m.id ? 'Submitting...' : 'Send for Approval'}
                                      </Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
