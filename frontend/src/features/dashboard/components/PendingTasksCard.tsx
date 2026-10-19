import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListTodo, CheckCircle2, Clock, Building, FileText, ArrowRight } from 'lucide-react';
import { useAssignedTasks } from '../api/useAssignedTasks';
import type { AssignableTaskOption } from '../api/types';

export function PendingTasksCard() {
  const navigate = useNavigate();
  const { tasks, isLoading } = useAssignedTasks({ allTasksForAdmin: false });

  const pendingTasks = useMemo(() => {
    return tasks.filter(
      (task) => task.status !== 'Completed' && task.status !== 'Cancelled'
    );
  }, [tasks]);

  const handleNavigateToTask = (task: AssignableTaskOption) => {
    const params = new URLSearchParams({
      tab: 'work-requests',
      view: 'board',
      wrId: task.workRequestId,
      taskId: task.taskId,
    });
    navigate(`/operations?${params.toString()}`);
  };

  const formatPhase = (phase: string | null) => {
    if (!phase) return null;
    switch (phase) {
      case 'pre_processing':
        return 'Pre-Processing';
      case 'processing':
        return 'Processing';
      case 'quality_assurance':
        return 'Quality Assurance';
      case 'completion':
        return 'Completion';
      default:
        return phase;
    }
  };

  return (
    <Card data-testid="pending-tasks-card" className="border border-[#0A0A0A] bg-[#FAF9F5] rounded-none shadow-none">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2 border-b border-[#0A0A0A]">
        <div className="space-y-0.5">
          <CardTitle className="text-base font-bold text-[#0A0A0A] flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-[#0A0A0A]" />
            Pending Tasks Assigned to Me
          </CardTitle>
          <CardDescription className="text-xs text-[#4A4945]">
            Active work items requiring your attention across work requests.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={pendingTasks.length > 0 ? 'warning' : 'success'}
            className="text-xs font-mono rounded-none border border-[#0A0A0A]"
            data-testid="pending-tasks-count-badge"
          >
            {pendingTasks.length} {pendingTasks.length === 1 ? 'Task' : 'Tasks'} Incomplete
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {isLoading ? (
          <div
            className="p-8 text-center text-xs font-mono text-[#4A4945]"
            data-testid="pending-tasks-loading"
          >
            <div className="inline-block h-5 w-5 animate-spin rounded-none border-2 border-solid border-[#0A0A0A] border-r-transparent mb-2 align-middle" />
            <p>Loading assigned tasks...</p>
          </div>
        ) : pendingTasks.length === 0 ? (
          <div
            className="p-8 text-center bg-[#FAF9F5] border border-[#C8C5BC] rounded-none space-y-2"
            data-testid="pending-tasks-empty"
          >
            <CheckCircle2 className="h-8 w-8 text-[#0F5223] mx-auto" />
            <h4 className="text-sm font-bold text-[#0A0A0A]">All caught up!</h4>
            <p className="text-xs text-[#4A4945] max-w-sm mx-auto">
              You have no incomplete tasks assigned to you in active work requests.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="pending-tasks-list">
            {pendingTasks.map((task) => (
              <div
                key={task.taskId}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-[#FFFFFF] border border-[#C8C5BC] hover:border-[#0A0A0A] rounded-none transition-all gap-3"
                data-testid={`pending-task-${task.taskId}`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-[#0A0A0A] truncate">
                      {task.taskTitle}
                    </span>
                    <Badge
                      variant={task.entity === 'LTA' ? 'lta' : 'ata'}
                      size="compact"
                      className="rounded-none font-mono text-xs"
                    >
                      {task.entity}
                    </Badge>
                    {task.phase && (
                      <Badge variant="secondary" size="compact" className="rounded-none font-mono text-xs border border-[#C8C5BC] bg-[#EAE8E3] text-[#0A0A0A]">
                        {formatPhase(task.phase)}
                      </Badge>
                    )}
                    <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-none bg-[#FDF3D7] text-[#734800] border border-[#B87500] flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#4A4945]">
                    <span className="flex items-center gap-1 font-medium text-[#0A0A0A]">
                      <FileText className="h-3.5 w-3.5 text-[#4A4945]" />
                      {task.workRequestTitle}
                    </span>
                    {task.clientName && (
                      <span className="flex items-center gap-1 text-[#4A4945]">
                        <Building className="h-3.5 w-3.5 text-[#4A4945]" />
                        {task.clientName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleNavigateToTask(task)}
                    className="text-xs font-mono font-semibold h-8 gap-1.5 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3] cursor-pointer"
                    data-testid={`view-task-btn-${task.taskId}`}
                  >
                    View in Operations
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
