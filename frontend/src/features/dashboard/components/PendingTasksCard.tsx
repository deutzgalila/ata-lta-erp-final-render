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
  const { tasks, isLoading } = useAssignedTasks();

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
    <Card data-testid="pending-tasks-card" className="border-slate-200">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
        <div className="space-y-0.5">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-blue-600" />
            Pending Tasks Assigned to Me
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Active work items requiring your attention across work requests.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={pendingTasks.length > 0 ? 'warning' : 'success'}
            className="text-xs"
            data-testid="pending-tasks-count-badge"
          >
            {pendingTasks.length} {pendingTasks.length === 1 ? 'Task' : 'Tasks'} Incomplete
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div
            className="p-8 text-center text-xs text-slate-500"
            data-testid="pending-tasks-loading"
          >
            <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-blue-600 border-r-transparent mb-2 align-middle" />
            <p>Loading assigned tasks...</p>
          </div>
        ) : pendingTasks.length === 0 ? (
          <div
            className="p-8 text-center bg-slate-50 border border-slate-100 rounded-lg space-y-2"
            data-testid="pending-tasks-empty"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-800">All caught up!</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You have no incomplete tasks assigned to you in active work requests.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="pending-tasks-list">
            {pendingTasks.map((task) => (
              <div
                key={task.taskId}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-xs transition-all gap-3"
                data-testid={`pending-task-${task.taskId}`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {task.taskTitle}
                    </span>
                    <Badge
                      variant={task.entity === 'LTA' ? 'lta' : 'ata'}
                      size="compact"
                    >
                      {task.entity}
                    </Badge>
                    {task.phase && (
                      <Badge variant="secondary" size="compact">
                        {formatPhase(task.phase)}
                      </Badge>
                    )}
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      {task.workRequestTitle}
                    </span>
                    {task.clientName && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Building className="h-3.5 w-3.5 text-slate-400" />
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
                    className="text-xs h-8 gap-1.5 text-slate-700 hover:text-blue-600 hover:border-blue-300"
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
