import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardList,
  Clock3,
  Link2,
  LoaderCircle,
  PencilLine,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import type { ArtModule } from './data/modules'

type ProjectPlanStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed'

type ProjectPlanItem = {
  id: string
  phaseName: string
  phaseOrder: number
  title: string
  description: string
  status: ProjectPlanStatus
  progress: number
  owner: string
  startDate: string
  dueDate: string
  moduleId: string
  acceptance: string
  updatedAt: string
}

type ProjectPlan = {
  schemaVersion: number
  projectId: string
  updatedAt: string
  items: ProjectPlanItem[]
}

const statusCopy: Record<ProjectPlanStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  blocked: '已阻塞',
  completed: '已完成',
}

function emptyPlan(projectId: string): ProjectPlan {
  return { schemaVersion: 1, projectId, updatedAt: '', items: [] }
}

function newPlanItem(items: ProjectPlanItem[]): ProjectPlanItem {
  const lastItem = [...items].sort((first, second) => second.phaseOrder - first.phaseOrder)[0]
  return {
    id: `plan-${Date.now()}`,
    phaseName: lastItem?.phaseName || '阶段 1',
    phaseOrder: lastItem?.phaseOrder || 1,
    title: '',
    description: '',
    status: 'not_started',
    progress: 0,
    owner: '',
    startDate: '',
    dueDate: '',
    moduleId: '',
    acceptance: '',
    updatedAt: '',
  }
}

export function ProjectPlanPage({ projectId, modules, staticDemo }: { projectId: string; modules: ArtModule[]; staticDemo: boolean }) {
  const [plan, setPlan] = useState<ProjectPlan | null>(null)
  const [draft, setDraft] = useState<ProjectPlanItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectPlanStatus>('all')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setDraft(null)
    setMessage(null)
    void (async () => {
      try {
        if (staticDemo) {
          const stored = window.localStorage.getItem(`artflow:project-plan:${projectId}:v1`)
          setPlan(stored ? JSON.parse(stored) : emptyPlan(projectId))
        } else {
          const response = await fetch(`/api/projects/${projectId}/plan`)
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || '项目计划读取失败。')
          setPlan(result)
        }
      } catch (loadError) {
        setPlan(null)
        setMessage({ type: 'error', text: loadError instanceof Error ? loadError.message : '项目计划读取失败。' })
      } finally {
        setLoading(false)
      }
    })()
  }, [projectId, staticDemo])

  const persistPlan = async (nextPlan: ProjectPlan, successMessage: string) => {
    setSaving(true)
    setMessage(null)
    try {
      const value = { ...nextPlan, updatedAt: new Date().toISOString() }
      if (staticDemo) {
        window.localStorage.setItem(`artflow:project-plan:${projectId}:v1`, JSON.stringify(value))
        setPlan(value)
      } else {
        const response = await fetch(`/api/projects/${projectId}/plan`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: value }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '项目计划保存失败。')
        setPlan(result.plan)
      }
      setDraft(null)
      setMessage({ type: 'success', text: successMessage })
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError instanceof Error ? saveError.message : '项目计划保存失败。' })
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!plan || !draft) return
    if (!draft.title.trim() || !draft.phaseName.trim()) {
      setMessage({ type: 'error', text: '请填写阶段名称和计划项标题。' })
      return
    }
    if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) {
      setMessage({ type: 'error', text: '计划结束日期不能早于开始日期。' })
      return
    }
    const item = {
      ...draft,
      phaseName: draft.phaseName.trim(),
      title: draft.title.trim(),
      progress: draft.status === 'completed' ? 100 : Math.min(100, Math.max(0, Math.round(draft.progress))),
      updatedAt: new Date().toISOString(),
    }
    const exists = plan.items.some((current) => current.id === item.id)
    const items = exists ? plan.items.map((current) => current.id === item.id ? item : current) : [...plan.items, item]
    void persistPlan({ ...plan, items }, exists ? `已更新计划项“${item.title}”。` : `已新增计划项“${item.title}”。`)
  }

  const removeItem = (item: ProjectPlanItem) => {
    if (!plan || !window.confirm(`确定删除计划项“${item.title}”吗？`)) return
    void persistPlan({ ...plan, items: plan.items.filter((current) => current.id !== item.id) }, `已删除计划项“${item.title}”。`)
  }

  const today = new Date().toISOString().slice(0, 10)
  const summary = useMemo(() => {
    const items = plan?.items || []
    const totalProgress = items.reduce((total, item) => total + item.progress, 0)
    return {
      total: items.length,
      progress: items.length ? Math.round(totalProgress / items.length) : 0,
      inProgress: items.filter((item) => item.status === 'in_progress').length,
      blocked: items.filter((item) => item.status === 'blocked').length,
      overdue: items.filter((item) => item.status !== 'completed' && item.dueDate && item.dueDate < today).length,
    }
  }, [plan, today])

  const phases = useMemo(() => {
    const phaseMap = new Map<string, { name: string; order: number; items: ProjectPlanItem[] }>()
    for (const item of plan?.items || []) {
      if (statusFilter !== 'all' && item.status !== statusFilter) continue
      const key = `${item.phaseOrder}:${item.phaseName}`
      const phase = phaseMap.get(key) || { name: item.phaseName, order: item.phaseOrder, items: [] }
      phase.items.push(item)
      phaseMap.set(key, phase)
    }
    return [...phaseMap.values()].sort((first, second) => first.order - second.order || first.name.localeCompare(second.name, 'zh-CN'))
  }, [plan, statusFilter])

  const moduleName = (moduleId: string) => modules.find((module) => module.id === moduleId)?.title || '项目整体'

  if (loading) return <div className="registry-empty"><LoaderCircle className="spin" size={25} /> 正在读取项目计划…</div>
  if (!plan) return <div className="registry-empty is-error"><X size={23} /> {message?.text || '项目计划不可用。'}</div>

  return (
    <div className="project-plan-page page-enter">
      <section className="project-plan-hero">
        <div>
          <span className="section-kicker"><ClipboardList size={14} /> PROJECT IMPLEMENTATION PLAN</span>
          <h1>项目计划</h1>
          <p>按阶段维护项目实现任务、负责人、时间、状态、完成进度与验收标准；所有记录仅属于当前项目。</p>
        </div>
        <button className="button primary" onClick={() => setDraft(newPlanItem(plan.items))}><Plus size={17} /> 新增计划项</button>
      </section>

      <section className="plan-summary" aria-label="项目计划概览">
        <article><ClipboardList size={18} /><span>计划项</span><strong>{summary.total}</strong><small>当前项目全部任务</small></article>
        <article><Clock3 size={18} /><span>总体进度</span><strong>{summary.progress}%</strong><small>按计划项平均计算</small></article>
        <article><PencilLine size={18} /><span>进行中</span><strong>{summary.inProgress}</strong><small>正在执行的计划项</small></article>
        <article className={summary.blocked ? 'attention' : ''}><CircleAlert size={18} /><span>已阻塞</span><strong>{summary.blocked}</strong><small>需要立即处理</small></article>
        <article className={summary.overdue ? 'attention' : ''}><CalendarDays size={18} /><span>已逾期</span><strong>{summary.overdue}</strong><small>未完成且超过截止日</small></article>
      </section>

      <section className="plan-overall-progress">
        <div><span>项目总体实现进度</span><strong>{summary.progress}%</strong></div>
        <span><i style={{ width: `${summary.progress}%` }} /></span>
        <small>{summary.blocked || summary.overdue ? `${summary.blocked} 项阻塞 · ${summary.overdue} 项逾期` : '当前没有阻塞或逾期计划项'}</small>
      </section>

      {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}

      {draft && (
        <form className="plan-editor" onSubmit={saveDraft}>
          <header><div><span>{plan.items.some((item) => item.id === draft.id) ? 'EDIT PLAN ITEM' : 'NEW PLAN ITEM'}</span><h2>{plan.items.some((item) => item.id === draft.id) ? '编辑计划项' : '新增计划项'}</h2></div><button type="button" onClick={() => setDraft(null)} aria-label="关闭编辑"><X size={18} /></button></header>
          <div className="plan-editor-grid">
            <label className="wide"><span>计划项标题 *</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：完成第一关垂直切片" maxLength={120} /></label>
            <label><span>阶段名称 *</span><input value={draft.phaseName} onChange={(event) => setDraft({ ...draft, phaseName: event.target.value })} placeholder="例如：垂直切片" maxLength={60} /></label>
            <label><span>阶段序号</span><input type="number" min="1" max="999" value={draft.phaseOrder} onChange={(event) => setDraft({ ...draft, phaseOrder: Number(event.target.value) || 1 })} /></label>
            <label><span>状态</span><select value={draft.status} onChange={(event) => { const status = event.target.value as ProjectPlanStatus; setDraft({ ...draft, status, progress: status === 'completed' ? 100 : draft.progress }) }}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>完成进度（%）</span><input type="number" min="0" max="100" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) || 0 })} /></label>
            <label><span>负责人</span><input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="姓名或岗位" maxLength={60} /></label>
            <label><span>关联模块</span><select value={draft.moduleId} onChange={(event) => setDraft({ ...draft, moduleId: event.target.value })}><option value="">项目整体</option>{modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label>
            <label><span>开始日期</span><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
            <label><span>截止日期</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label>
            <label className="full"><span>实现说明</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="需要完成什么、前置条件、交付物和协作说明" rows={3} maxLength={1000} /></label>
            <label className="full"><span>验收规则</span><textarea value={draft.acceptance} onChange={(event) => setDraft({ ...draft, acceptance: event.target.value })} placeholder="明确完成判定、测试证据和质量门槛" rows={3} maxLength={1000} /></label>
          </div>
          <footer><button className="button ghost" type="button" onClick={() => setDraft(null)}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存计划项</button></footer>
        </form>
      )}

      <div className="plan-list-heading">
        <div><span className="eyebrow"><span /> IMPLEMENTATION TRACKING</span><h2>实现计划与进展</h2></div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ProjectPlanStatus)}><option value="all">全部状态</option>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>

      {plan.items.length === 0 ? (
        <div className="plan-empty"><ClipboardList size={32} /><strong>当前项目还没有计划项</strong><p>从新增计划项开始，按阶段记录实现任务、进度和验收标准。</p><button className="button primary" onClick={() => setDraft(newPlanItem(plan.items))}><Plus size={16} /> 新增第一个计划项</button></div>
      ) : phases.length === 0 ? (
        <div className="plan-empty"><CircleAlert size={30} /><strong>当前筛选条件下没有计划项</strong><p>切换状态筛选可查看其他任务。</p></div>
      ) : phases.map((phase) => {
        const phaseProgress = Math.round(phase.items.reduce((total, item) => total + item.progress, 0) / phase.items.length)
        return <section className="plan-phase" key={`${phase.order}-${phase.name}`}>
          <header><div><span>{String(phase.order).padStart(2, '0')} / PROJECT PHASE</span><h3>{phase.name}</h3></div><div><strong>{phaseProgress}%</strong><small>{phase.items.length} 个计划项</small></div></header>
          <div className="plan-task-grid">{phase.items.map((item) => {
            const overdue = item.status !== 'completed' && item.dueDate && item.dueDate < today
            return <article className={`plan-task-card ${item.status}${overdue ? ' overdue' : ''}`} key={item.id}>
              <header><span className={`plan-status ${item.status}`}>{statusCopy[item.status]}</span><div><button onClick={() => setDraft({ ...item })}><PencilLine size={14} /> 编辑</button><button className="danger" onClick={() => removeItem(item)} disabled={saving}><Trash2 size={14} /> 删除</button></div></header>
              <h4>{item.title}</h4>
              {item.description && <p>{item.description}</p>}
              <div className="plan-task-meta"><span><Link2 size={13} /> {moduleName(item.moduleId)}</span><span><UserRound size={13} /> {item.owner || '未指定负责人'}</span><span className={overdue ? 'is-overdue' : ''}><CalendarDays size={13} /> {item.startDate || '未设开始'} — {item.dueDate || '未设截止'}{overdue ? ' · 已逾期' : ''}</span></div>
              <div className="plan-task-progress"><div><span>完成进度</span><strong>{item.progress}%</strong></div><span><i style={{ width: `${item.progress}%` }} /></span></div>
              {item.acceptance && <div className="plan-acceptance"><Check size={14} /><p><strong>验收规则</strong>{item.acceptance}</p></div>}
            </article>
          })}</div>
        </section>
      })}
    </div>
  )
}
