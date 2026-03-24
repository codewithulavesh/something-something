import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle, XCircle, AlertCircle, Clock, ExternalLink, MessageCircle, ArrowRightCircle } from 'lucide-react';
import { useRealtime } from '@/hooks/useRealtime';
import { sendNotification } from '@/lib/notifications';
import { formatDistanceToNow, isPast } from 'date-fns';

type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

const statusConfig: Record<MilestoneStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Upcoming', color: 'bg-slate-500/15 text-slate-400 border-slate-500/20', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: ArrowRightCircle },
  submitted: { label: 'Review Required', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: AlertCircle },
  approved: { label: 'Approved', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: XCircle },
};

export default function CompanyMilestones() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<Record<string, any[]>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    const { data: projs } = await supabase.from('projects').select('*').eq('company_id', profile.id).order('created_at', { ascending: false });
    if (!projs) return;
    setProjects(projs);

    const ms: Record<string, any[]> = {};
    await Promise.all(projs.map(async (p) => {
      const { data } = await supabase.from('milestones').select('*, deliverables(*), profiles:deliverables(profiles(name))').eq('project_id', p.id).order('created_at');
      if (data) ms[p.id] = data;
    }));
    setMilestones(ms);
  }, [profile]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useRealtime([{ table: 'milestones', onData: fetchAll }], [profile?.id]);

  const handleReview = async (m: any, status: 'approved' | 'rejected') => {
    setUpdating(m.id);
    const { error } = await supabase.from('milestones').update({ status }).eq('id', m.id);
    if (error) { toast.error(error.message); setUpdating(null); return; }

    const project = projects.find((p) => p.id === m.project_id);
    const { data: team } = await supabase.from('teams').select('leader_id').eq('project_id', m.project_id).single();

    if (team) {
      await sendNotification(
        team.leader_id,
        status === 'approved' ? '✅ Milestone Approved' : '❌ Milestone Rejected',
        `Milestone "${m.title}" on "${project?.title}" was ${status}. ${status === 'rejected' ? 'Review feedback provided.' : ''}`,
        status === 'approved' ? 'success' : 'warning'
      );
    }

    toast.success(`Milestone ${status}`);
    setReviewNote('');
    setUpdating(null);
    fetchAll();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Project Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review submissions and monitor project progress</p>
      </div>

      {projects.length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center border-dashed">
          <MessageCircle className="w-12 h-12 text-muted-foreground/20 mb-4" />
          <h3 className="font-semibold text-foreground">No Projects Underway</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">Accept a bid to start tracking milestones and reviewing submissions.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {projects.map((p) => {
            const pMs = milestones[p.id] || [];
            const done = pMs.filter((m) => m.status === 'approved').length;
            const progress = pMs.length ? Math.round((done / pMs.length) * 100) : 0;
            const pendingReviews = pMs.filter((m) => m.status === 'submitted').length;

            return (
              <Card key={p.id} className="shadow-card border-l-4 border-l-primary">
                <CardHeader className="pb-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base truncate">{p.title}</CardTitle>
                        {pendingReviews > 0 && <Badge variant="secondary" className="bg-amber-500/15 text-amber-400 border-amber-500/20">{pendingReviews} awaiting review</Badge>}
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex-1 max-w-[280px]">
                          <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1.5">
                            <span>Maturity</span>
                            <span className="text-foreground">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-9 hover:bg-muted" asChild>
                        <a href="/dashboard/workspace">Open Workspace</a>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {!pMs.length ? (
                    <div className="p-8 text-center bg-muted/5 italic text-xs text-muted-foreground">The team has not defined any milestones yet.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {pMs.map((m) => {
                        const { color, icon: Icon, label } = statusConfig[m.status as MilestoneStatus] || statusConfig.pending;
                        const deliverable = m.deliverables?.[0];
                        const overdue = m.deadline && isPast(new Date(m.deadline)) && m.status !== 'approved';

                        return (
                          <div key={m.id} className="flex items-start gap-5 p-5 hover:bg-muted/10 transition-colors">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${color}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold text-foreground truncate">{m.title}</h4>
                                <Badge variant="outline" className={`text-[10px] font-medium border ${color}`}>{label}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-3">{m.description}</p>
                              <div className="flex items-center gap-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                {m.deadline && (
                                  <span className={`flex items-center gap-1 ${overdue ? 'text-destructive font-extrabold' : ''}`}>
                                    <Clock className="w-3 h-3" /> {new Date(m.deadline).toLocaleDateString()}
                                  </span>
                                )}
                                {deliverable?.submission_link && (
                                  <a href={deliverable.submission_link} target="_blank" rel="noopener" className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors">
                                    <ExternalLink className="w-3 h-3" /> View Deliverable
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-center">
                              {m.status === 'submitted' ? (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" className="gradient-primary text-primary-foreground h-9 font-semibold">
                                      Review Submission
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader><DialogTitle>Task Review: {m.title}</DialogTitle></DialogHeader>
                                    <div className="space-y-4 pt-2">
                                      <div className="space-y-2">
                                        <p className="text-xs font-bold text-muted-foreground uppercase">Deliverable Artifact</p>
                                        <div className="p-3 rounded-lg bg-muted/30 border border-border flex items-center justify-between">
                                          <span className="text-sm font-medium truncate max-w-[200px]">{deliverable?.submission_link}</span>
                                          <Button size="icon" variant="ghost" asChild className="h-7 w-7"><a href={deliverable?.submission_link} target="_blank" rel="noopener"><ExternalLink className="w-3.5 h-3.5" /></a></Button>
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Internal Notes / Feedback</Label>
                                        <Textarea
                                          value={reviewNote}
                                          onChange={(e) => setReviewNote(e.target.value)}
                                          placeholder="Explain why you're approving or what needs to be fixed..."
                                          rows={4}
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          onClick={() => handleReview(m, 'approved')}
                                          disabled={!!updating}
                                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                        >
                                          Approve Release
                                        </Button>
                                        <Button
                                          onClick={() => handleReview(m, 'rejected')}
                                          disabled={!!updating}
                                          variant="destructive"
                                          className="flex-1 font-semibold"
                                        >
                                          Request Revision
                                        </Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
