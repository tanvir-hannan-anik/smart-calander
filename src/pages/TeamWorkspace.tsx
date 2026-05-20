import { useEffect, useState, ReactNode } from 'react';
import { Plus, ChevronLeft, ChevronRight, Trash2, X, Users, UserPlus, Mail, Check, LogOut as LeaveIcon } from 'lucide-react';
import { auth } from '../lib/auth';
import { useWorkspace } from '../lib/workspaceContext';
import {
  inviteMember, subscribePendingInvitations, acceptInvitation, declineInvitation,
  removeMember, deleteWorkspace, Invitation, WorkspaceTaskStatus,
} from '../lib/workspaces';

const ORDER: WorkspaceTaskStatus[] = ['todo', 'in-progress', 'done'];
const COLUMNS: { id: WorkspaceTaskStatus, title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export default function TeamWorkspace() {
  const {
    workspaces, workspace, loading, setActiveWorkspaceId,
    createWorkspace, addTask, moveTask, deleteTask, refreshWorkspaces,
  } = useWorkspace();

  const user = auth.currentUser;
  const [isAddingTask, setIsAddingTask] = useState<WorkspaceTaskStatus | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);

  // Real-time pending invitations for this user's email.
  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribePendingInvitations(user.email, setPendingInvites);
    return () => unsub();
  }, [user?.email]);

  // ─── Auth-gated empty states ──────────────────────────────────────────────
  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Users className="w-10 h-10 mx-auto mb-3 text-gray-500" />
          <h2 className="text-xl font-semibold mb-1">Team Workspace</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Sign in with Google to create a shared workspace and collaborate with teammates.
          </p>
        </div>
      </div>
    );
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleAddTask = async (status: WorkspaceTaskStatus) => {
    if (!newTaskTitle.trim() || !workspace) return;
    const t = await addTask(newTaskTitle.trim(), user.uid, 'General');
    if (t && status !== 'todo') await moveTask(t.id, status);
    setNewTaskTitle('');
    setIsAddingTask(null);
  };

  const moveRelative = (id: string, current: WorkspaceTaskStatus, dir: -1 | 1) => {
    const next = ORDER[ORDER.indexOf(current) + dir];
    if (next) void moveTask(id, next);
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    setCreatingWs(true);
    try {
      await createWorkspace(newWsName.trim());
      setNewWsName('');
      setShowCreate(false);
    } finally {
      setCreatingWs(false);
    }
  };

  const handleInvite = async () => {
    if (!workspace || !inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      await inviteMember(
        { id: workspace.id, name: workspace.name },
        { uid: user.uid, email: user.email },
        inviteEmail,
      );
      setInviteMsg({ type: 'ok', text: `Invited ${inviteEmail.trim()}. They will see it on their next login.` });
      setInviteEmail('');
    } catch (err: any) {
      setInviteMsg({ type: 'err', text: err?.message || 'Invite failed.' });
    } finally {
      setInviteBusy(false);
    }
  };

  const handleAccept = async (inv: Invitation) => {
    try {
      await acceptInvitation(inv, {
        uid: user.uid, email: user.email,
        displayName: user.displayName, photoURL: user.photoURL,
      });
      await refreshWorkspaces();
      setActiveWorkspaceId(inv.workspaceId);
    } catch (err) {
      console.error('Accept invitation failed:', err);
    }
  };

  const handleDecline = async (inv: Invitation) => {
    try { await declineInvitation(inv.id); } catch (err) { console.error(err); }
  };

  const handleLeave = async () => {
    if (!workspace) return;
    const isOwner = workspace.ownerUid === user.uid;
    const confirmMsg = isOwner
      ? `Delete workspace "${workspace.name}"? This removes it for all members.`
      : `Leave workspace "${workspace.name}"?`;
    if (!confirm(confirmMsg)) return;
    if (isOwner) await deleteWorkspace(workspace.id);
    else await removeMember(workspace.id, user.uid);
    await refreshWorkspaces();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      <header className="pt-4 pb-6 border-b border-[#2C2C2C] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2 truncate">
            {workspace ? workspace.name : 'Team Workspace'}
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Shared kanban — invite teammates by Google email.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Workspace switcher */}
          {workspaces.length > 0 && (
            <select
              value={workspace?.id || ''}
              onChange={e => setActiveWorkspaceId(e.target.value || null)}
              className="bg-[#222] border border-[#333] rounded-md px-2 py-1.5 text-sm"
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 rounded-md bg-[#2A2A2A] hover:bg-[#333] border border-[#333] text-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New workspace
          </button>
          {workspace && (
            <>
              <div className="flex -space-x-2">
                {workspace.memberUids.map(uid => {
                  const info = workspace.memberInfo[uid];
                  return (
                    <div
                      key={uid}
                      className="w-8 h-8 rounded-full border-2 border-[var(--bg-main)] bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs overflow-hidden"
                      title={`${info?.name || 'Member'}${info?.email ? ` (${info.email})` : ''}`}
                    >
                      {info?.photoURL
                        ? <img src={info.photoURL} alt="" className="w-full h-full object-cover" />
                        : (info?.name || '?').charAt(0).toUpperCase()}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setShowInvite(true)}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" /> Invite
              </button>
              <button
                onClick={handleLeave}
                className="px-3 py-1.5 rounded-md bg-[#2A2A2A] hover:bg-red-500/20 hover:text-red-400 border border-[#333] text-sm flex items-center gap-1.5"
                title={workspace.ownerUid === user.uid ? 'Delete this workspace' : 'Leave this workspace'}
              >
                <LeaveIcon className="w-4 h-4" />
                {workspace.ownerUid === user.uid ? 'Delete' : 'Leave'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Pending invitations banner */}
      {pendingInvites.length > 0 && (
        <div className="mt-4 space-y-2">
          {pendingInvites.map(inv => (
            <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
              <Mail className="w-5 h-5 text-blue-400 shrink-0" />
              <p className="text-sm text-blue-100 flex-1">
                <span className="font-medium">{inv.inviterEmail || 'Someone'}</span> invited you to <span className="font-medium">{inv.workspaceName}</span>.
              </p>
              <button onClick={() => handleAccept(inv)} className="px-3 py-1 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Accept
              </button>
              <button onClick={() => handleDecline(inv)} className="px-3 py-1 rounded-md bg-[#2A2A2A] hover:bg-[#333] text-xs">
                Decline
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state: no workspace yet */}
      {!loading && !workspace && workspaces.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Users className="w-10 h-10 mx-auto mb-3 text-gray-500" />
            <h2 className="text-lg font-semibold mb-1">Create your first workspace</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Workspaces are shared boards — invite teammates by email to collaborate in real time.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
            >
              + Create workspace
            </button>
          </div>
        </div>
      )}

      {/* Kanban board */}
      {workspace && (
        <div className="flex-1 flex gap-6 overflow-x-auto py-6 min-h-0">
          {COLUMNS.map(col => (
            <div key={col.id} className="flex-shrink-0 w-80 flex flex-col bg-[#1C1C1C] rounded-xl border border-[#2C2C2C] max-h-full">
              <div className="p-4 border-b border-[#2C2C2C] flex justify-between items-center bg-[#222] rounded-t-xl shrink-0">
                <span className="font-medium text-sm">{col.title}</span>
                <span className="bg-[#111] text-xs px-2 py-0.5 rounded-full text-gray-400">
                  {workspace.tasks.filter(t => t.status === col.id).length}
                </span>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-3 hide-scrollbar">
                {workspace.tasks.filter(t => t.status === col.id).map(task => {
                  const assignee = workspace.memberInfo[task.assigneeUid];
                  return (
                    <div key={task.id} className="bg-[#2a2a2a] p-3 rounded-lg border border-[#3a3a3a] group hover:border-gray-500 transition-colors">
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-[#444] text-[var(--text-secondary)]">
                          {task.label}
                        </span>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          aria-label="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-sm font-medium mb-3">{task.title}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#333]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] shrink-0 overflow-hidden">
                            {assignee?.photoURL
                              ? <img src={assignee.photoURL} alt="" className="w-full h-full object-cover" />
                              : (assignee?.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-500 truncate">{assignee?.name || 'Member'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveRelative(task.id, col.id, -1)} disabled={col.id === 'todo'}
                            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            aria-label="Move left">
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moveRelative(task.id, col.id, 1)} disabled={col.id === 'done'}
                            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            aria-label="Move right">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isAddingTask === col.id ? (
                  <div className="bg-[#2a2a2a] p-2 rounded-lg border border-blue-500">
                    <input
                      autoFocus type="text" value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleAddTask(col.id);
                        if (e.key === 'Escape') { setIsAddingTask(null); setNewTaskTitle(''); }
                      }}
                      placeholder="Task title..."
                      className="w-full bg-transparent text-sm outline-none mb-1 text-white placeholder-gray-500"
                    />
                    <div className="flex justify-end items-center gap-2 mt-1">
                      <button onClick={() => { setIsAddingTask(null); setNewTaskTitle(''); }} className="text-gray-500 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                      <button onClick={() => void handleAddTask(col.id)} disabled={!newTaskTitle.trim()}
                        className="text-blue-400 hover:text-blue-300 disabled:opacity-40 text-xs font-medium">
                        Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setIsAddingTask(col.id)}
                    className="w-full py-2 flex justify-center text-[var(--text-muted)] hover:text-white transition-colors bg-[#222] rounded-lg border border-dashed border-[#333] hover:border-gray-500">
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite modal */}
      {showInvite && workspace && (
        <Modal onClose={() => { setShowInvite(false); setInviteMsg(null); setInviteEmail(''); }}>
          <h3 className="text-lg font-semibold mb-1">Invite to {workspace.name}</h3>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Enter the Google email address of your teammate. They will see the invitation the next time they log in.
          </p>
          <input
            autoFocus type="email" placeholder="teammate@gmail.com" value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleInvite(); }}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          {inviteMsg && (
            <p className={`mt-2 text-xs ${inviteMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{inviteMsg.text}</p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowInvite(false); setInviteMsg(null); setInviteEmail(''); }}
              className="px-3 py-1.5 rounded-md bg-[#2A2A2A] hover:bg-[#333] text-sm">Close</button>
            <button onClick={() => void handleInvite()} disabled={inviteBusy || !inviteEmail.trim()}
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium">
              {inviteBusy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </Modal>
      )}

      {/* Create workspace modal */}
      {showCreate && (
        <Modal onClose={() => { setShowCreate(false); setNewWsName(''); }}>
          <h3 className="text-lg font-semibold mb-1">New workspace</h3>
          <p className="text-xs text-[var(--text-secondary)] mb-4">Give it a name — you can invite teammates after it's created.</p>
          <input
            autoFocus type="text" placeholder="e.g. Final Year Project" value={newWsName}
            onChange={e => setNewWsName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreateWorkspace(); }}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowCreate(false); setNewWsName(''); }}
              className="px-3 py-1.5 rounded-md bg-[#2A2A2A] hover:bg-[#333] text-sm">Cancel</button>
            <button onClick={() => void handleCreateWorkspace()} disabled={creatingWs || !newWsName.trim()}
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium">
              {creatingWs ? 'Creating…' : 'Create'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1C1C1C] border border-[#2C2C2C] rounded-xl p-5 w-full max-w-sm shadow-xl">
        {children}
      </div>
    </div>
  );
}
