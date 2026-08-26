import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleAlert, ClipboardList, Gamepad2, Layers3, LoaderCircle, MapPinned, PencilLine, Plus, Save, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'

type GameStatus = 'planned' | 'in_progress' | 'ready'
type Game = { id: string; name: string; category: string; description: string; ruleReference: string; assetId: string; status: GameStatus; updatedAt: string }
type GameContent = { schemaVersion: number; projectId: string; updatedAt: string; games: Game[] }
const statusCopy: Record<GameStatus, string> = { planned: '待制作', in_progress: '制作中', ready: '已就绪' }

function emptyContent(projectId: string): GameContent { return { schemaVersion: 1, projectId, updatedAt: '', games: [] } }
function blankGame(): Game { return { id: `game_${Date.now()}`, name: '', category: '', description: '', ruleReference: '详细玩法设计', assetId: '', status: 'planned', updatedAt: '' } }

export function GameContentPage({ projectId, staticDemo }: { projectId: string; staticDemo: boolean }) {
  const [content, setContent] = useState<GameContent | null>(null)
  const [draft, setDraft] = useState<{ isNew: boolean; value: Game } | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!projectId) return
    void (async () => {
      setContent(null); setDraft(null); setMessage(null)
      try {
        if (staticDemo) {
          const stored = window.localStorage.getItem(`artflow:game-content:${projectId}:v1`)
          setContent(stored ? JSON.parse(stored) : emptyContent(projectId))
        } else {
          const response = await fetch(`/api/projects/${projectId}/game-content`)
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || '游戏内容读取失败。')
          setContent(result)
        }
      } catch (error) {
        setContent(null); setMessage({ type: 'error', text: error instanceof Error ? error.message : '游戏内容读取失败。' })
      }
    })()
  }, [projectId, staticDemo])

  const persist = async (nextContent: GameContent, success: string) => {
    setSaving(true); setMessage(null)
    try {
      const value = { ...nextContent, updatedAt: new Date().toISOString() }
      if (staticDemo) {
        window.localStorage.setItem(`artflow:game-content:${projectId}:v1`, JSON.stringify(value)); setContent(value)
      } else {
        const response = await fetch(`/api/projects/${projectId}/game-content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: value }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '游戏内容保存失败。')
        setContent(result.content)
      }
      setDraft(null); setMessage({ type: 'success', text: success })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '游戏内容保存失败。' })
    } finally { setSaving(false) }
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content || !draft) return
    const game = { ...draft.value, id: draft.value.id.trim(), name: draft.value.name.trim(), category: draft.value.category.trim() }
    if (!game.id || !game.name || !game.category) return setMessage({ type: 'error', text: '请填写稳定 ID、游戏名称和游戏类型。' })
    const games = draft.isNew ? [...content.games, game] : content.games.map((item) => item.id === game.id ? game : item)
    void persist({ ...content, games }, draft.isNew ? `已新增游戏“${game.name}”。` : `已更新游戏“${game.name}”。`)
  }

  const remove = (game: Game) => {
    if (!content || !window.confirm(`确定删除游戏内容“${game.name}”吗？已引用它的城市条目会保留引用并提示待修复。`)) return
    void persist({ ...content, games: content.games.filter((item) => item.id !== game.id) }, `已删除游戏“${game.name}”。`)
  }

  if (!content) return <div className="registry-empty"><LoaderCircle className="spin" size={25} /> 正在读取游戏内容…</div>
  return <div className="game-content-page page-enter">
    <section className="game-content-hero"><div><span className="section-kicker"><Gamepad2 size={14} /> GAME CONTENT CATALOG</span><h1>游戏管理</h1><p>维护可被城市引用的语言互动或小游戏内容：名称、类型、规则说明、制作状态和素材关联。城市内容管理只保存游戏 ID 及其出现位置。</p></div><div><Link className="button ghost" to="/modules/detailed-gameplay-design"><ClipboardList size={16} /> 查看详细玩法规则</Link><Link className="button ghost" to="/city-content-management"><MapPinned size={16} /> 查看城市引用</Link><button className="button primary" onClick={() => setDraft({ isNew: true, value: blankGame() })}><Plus size={17} /> 新增游戏</button></div></section>
    {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}
    {draft && createPortal(<div className="city-entity-modal-backdrop"><div className="city-entity-modal game-editor-modal" role="dialog" aria-modal="true" aria-label={draft.isNew ? '新增游戏内容' : '编辑游戏内容'}><GameEditor draft={draft} saving={saving} onChange={(value) => setDraft({ ...draft, value })} onCancel={() => setDraft(null)} onSave={save} /></div></div>, document.body)}
    <section className="game-catalog-section"><header><div><span className="eyebrow"><span /> PROJECT GAME CONTENT</span><h2>游戏目录</h2></div><strong>{content.games.length} 个游戏</strong></header>{content.games.length === 0 ? <div className="game-empty"><Gamepad2 size={31} /><strong>还没有游戏内容</strong><p>先建立游戏定义，再在城市内容管理中引用为片区互动或宝箱挑战。</p><button className="button primary" onClick={() => setDraft({ isNew: true, value: blankGame() })}><Plus size={16} /> 新增第一个游戏</button></div> : <div className="game-card-grid">{content.games.map((game) => <article className="game-card" key={game.id}><div className="game-card-actions"><button onClick={() => setDraft({ isNew: false, value: { ...game } })}><PencilLine size={14} /></button><button onClick={() => remove(game)} disabled={saving}><Trash2 size={14} /></button></div><span>{game.category} · {statusCopy[game.status]}</span><h3>{game.name}</h3><p>{game.description || '尚未填写游戏说明。'}</p><small>规则引用：{game.ruleReference || '未填写'}</small>{game.assetId && <small>素材资产：{game.assetId}</small>}<code>{game.id}</code></article>)}</div>}</section>
    <section className="game-reference-note"><Layers3 size={19} /><div><strong>引用约定</strong><p>城市内容管理中的游戏模块只保存游戏内容 ID、所属片区、关联宝箱和城市内状态；游戏本体的类型、规则说明和素材以本页为唯一来源。</p></div></section>
  </div>
}

function GameEditor({ draft, saving, onChange, onCancel, onSave }: { draft: { isNew: boolean; value: Game }; saving: boolean; onChange: (value: Game) => void; onCancel: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const game = draft.value
  const set = <K extends keyof Game>(key: K, value: Game[K]) => onChange({ ...game, [key]: value })
  return <form className="game-editor" onSubmit={onSave}><header><div><span>{draft.isNew ? 'NEW GAME' : 'EDIT GAME'}</span><h2>{draft.isNew ? '新增游戏内容' : `编辑 ${game.name}`}</h2></div><button type="button" onClick={onCancel}><X size={18} /></button></header><div className="game-editor-grid"><label><span>游戏内容 ID *</span><input value={game.id} disabled={!draft.isNew} onChange={(event) => set('id', event.target.value)} placeholder="game_picture_match" /></label><label><span>游戏名称 *</span><input value={game.name} onChange={(event) => set('name', event.target.value)} placeholder="图文配对" /></label><label><span>游戏类型 *</span><input value={game.category} onChange={(event) => set('category', event.target.value)} placeholder="听选、图文配对、跟读…" /></label><label><span>制作状态</span><select value={game.status} onChange={(event) => set('status', event.target.value as GameStatus)}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>规则引用</span><input value={game.ruleReference} onChange={(event) => set('ruleReference', event.target.value)} placeholder="详细玩法设计 / 分组 ID" /></label><label><span>素材资产 ID</span><input value={game.assetId} onChange={(event) => set('assetId', event.target.value)} placeholder="可选：资产注册中心 ID" /></label><label className="full"><span>游戏说明</span><textarea rows={3} value={game.description} onChange={(event) => set('description', event.target.value)} placeholder="记录玩法目标、输入输出、界面要点和必要的表现约束；通用流程规则引用详细玩法设计。" /></label></div><footer><button type="button" className="button ghost" onClick={onCancel}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存游戏内容</button></footer></form>
}
