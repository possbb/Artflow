import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  CircleAlert,
  ClipboardList,
  LoaderCircle,
  PencilLine,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'

type CharacterSettingState = 'draft' | 'review' | 'locked'
type CharacterPriority = 'P0' | 'P1' | 'P2'

type CharacterSetting = {
  id: string
  displayName: string
  roleType: string
  priority: CharacterPriority
  state: CharacterSettingState
  narrativeRole: string
  ageAndProportion: string
  identityAnchors: string
  silhouetteAndFeatures: string
  outfitAndAccessories: string
  paletteAndMaterials: string
  requiredViews: string
  expressionsAndPoses: string
  motionHandoff: string
  referenceAssetIds: string[]
  version: string
  updatedAt: string
}

type CharacterSettingSheets = {
  schemaVersion: number
  projectId: string
  updatedAt: string
  characters: CharacterSetting[]
}

type CharacterDraft = CharacterSetting & { referenceAssetIdsText: string }

const stateCopy: Record<CharacterSettingState, string> = {
  draft: '草稿',
  review: '待复核',
  locked: '已锁定',
}

function emptySheets(projectId: string): CharacterSettingSheets {
  return { schemaVersion: 1, projectId, updatedAt: '', characters: [] }
}

function normalizeStaticSheets(projectId: string, value: Partial<CharacterSettingSheets> | null): CharacterSettingSheets {
  return {
    schemaVersion: 1,
    projectId,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : '',
    characters: Array.isArray(value?.characters) ? value.characters : [],
  }
}

function newCharacterDraft(): CharacterDraft {
  return {
    id: `character_${Date.now()}`,
    displayName: '',
    roleType: '主角',
    priority: 'P0',
    state: 'draft',
    narrativeRole: '',
    ageAndProportion: '',
    identityAnchors: '',
    silhouetteAndFeatures: '',
    outfitAndAccessories: '',
    paletteAndMaterials: '',
    requiredViews: '正面、侧面、背面、游戏主镜头角度',
    expressionsAndPoses: '',
    motionHandoff: '',
    referenceAssetIds: [],
    referenceAssetIdsText: '',
    version: 'v001',
    updatedAt: '',
  }
}

function toDraft(character: CharacterSetting): CharacterDraft {
  return { ...character, referenceAssetIdsText: character.referenceAssetIds.join('\n') }
}

export function CharacterSettingSheetsPanel({ projectId, staticDemo }: { projectId: string; staticDemo: boolean }) {
  const [sheets, setSheets] = useState<CharacterSettingSheets | null>(null)
  const [draft, setDraft] = useState<CharacterDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setDraft(null)
    setMessage(null)
    void (async () => {
      try {
        if (staticDemo) {
          const stored = window.localStorage.getItem(`artflow:character-setting-sheets:${projectId}:v1`)
          setSheets(normalizeStaticSheets(projectId, stored ? JSON.parse(stored) : null))
        } else {
          const response = await fetch(`/api/projects/${projectId}/character-setting-sheets`)
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || '角色设定表读取失败。')
          setSheets(result)
        }
      } catch (loadError) {
        setSheets(null)
        setMessage({ type: 'error', text: loadError instanceof Error ? loadError.message : '角色设定表读取失败。' })
      } finally {
        setLoading(false)
      }
    })()
  }, [projectId, staticDemo])

  useEffect(() => {
    if (!draft) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [draft])

  const summary = useMemo(() => {
    const characters = sheets?.characters || []
    return {
      total: characters.length,
      p0: characters.filter((character) => character.priority === 'P0').length,
      locked: characters.filter((character) => character.state === 'locked').length,
      review: characters.filter((character) => character.state === 'review').length,
    }
  }, [sheets])

  const saveSheets = async (nextSheets: CharacterSettingSheets) => {
    const value = { ...nextSheets, updatedAt: new Date().toISOString() }
    if (staticDemo) {
      window.localStorage.setItem(`artflow:character-setting-sheets:${projectId}:v1`, JSON.stringify(value))
      setSheets(value)
      return
    }
    const response = await fetch(`/api/projects/${projectId}/character-setting-sheets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheets: value }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '角色设定表保存失败。')
    setSheets(result.sheets)
  }

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sheets || !draft) return
    if (!draft.id.trim() || !draft.displayName.trim()) {
      setMessage({ type: 'error', text: '请填写稳定角色 ID 和角色名称。' })
      return
    }
    const referenceAssetIds = [...new Set(draft.referenceAssetIdsText
      .split(/[\s,，]+/)
      .map((value) => value.trim())
      .filter(Boolean))]
    const character: CharacterSetting = {
      ...draft,
      id: draft.id.trim(),
      displayName: draft.displayName.trim(),
      roleType: draft.roleType.trim(),
      narrativeRole: draft.narrativeRole.trim(),
      ageAndProportion: draft.ageAndProportion.trim(),
      identityAnchors: draft.identityAnchors.trim(),
      silhouetteAndFeatures: draft.silhouetteAndFeatures.trim(),
      outfitAndAccessories: draft.outfitAndAccessories.trim(),
      paletteAndMaterials: draft.paletteAndMaterials.trim(),
      requiredViews: draft.requiredViews.trim(),
      expressionsAndPoses: draft.expressionsAndPoses.trim(),
      motionHandoff: draft.motionHandoff.trim(),
      referenceAssetIds,
      version: draft.version.trim() || 'v001',
      updatedAt: new Date().toISOString(),
    }
    delete (character as CharacterSetting & { referenceAssetIdsText?: string }).referenceAssetIdsText
    const exists = sheets.characters.some((current) => current.id === character.id)
    const characters = exists
      ? sheets.characters.map((current) => current.id === character.id ? character : current)
      : [...sheets.characters, character]
    setSaving(true)
    setMessage(null)
    try {
      await saveSheets({ ...sheets, characters })
      setDraft(null)
      setMessage({ type: 'success', text: `已保存“${character.displayName}”角色设定。` })
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError instanceof Error ? saveError.message : '角色设定表保存失败。' })
    } finally {
      setSaving(false)
    }
  }

  const removeCharacter = async (character: CharacterSetting) => {
    if (!sheets || !window.confirm(`确定删除角色设定“${character.displayName}”吗？关联资产不会被删除。`)) return
    setSaving(true)
    setMessage(null)
    try {
      await saveSheets({ ...sheets, characters: sheets.characters.filter((current) => current.id !== character.id) })
      setMessage({ type: 'success', text: `已删除“${character.displayName}”角色设定，关联资产保持不变。` })
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError instanceof Error ? saveError.message : '角色设定删除失败。' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="deliverables-loading"><LoaderCircle className="spin" size={24} /> 正在读取角色设定表…</div>
  if (!sheets) return <div className="deliverables-loading is-error"><X size={23} /> {message?.text || '角色设定表不可用。'}</div>

  return (
    <section className="character-setting-sheets" data-purpose="character-setting-sheets" aria-labelledby="character-setting-sheets-title">
      <header className="character-sheets-header">
        <div className="character-sheets-title-icon"><ClipboardList size={23} /></div>
        <div>
          <span>CHARACTER DESIGN SOURCE OF TRUTH</span>
          <h2 id="character-setting-sheets-title">角色设定表</h2>
          <p>锁定角色身份、比例、轮廓和制作交接；图片版本与技术状态统一通过资产 ID 在资产注册中心维护。</p>
        </div>
        <button className="button primary" type="button" onClick={() => setDraft(newCharacterDraft())}><Plus size={16} /> 新增角色</button>
      </header>

      <div className="character-sheets-summary" aria-label="角色设定概览">
        <article><UserRound size={17} /><span>角色记录</span><strong>{summary.total}</strong></article>
        <article><CircleAlert size={17} /><span>P0 核心角色</span><strong>{summary.p0}</strong></article>
        <article><PencilLine size={17} /><span>待复核</span><strong>{summary.review}</strong></article>
        <article><ShieldCheck size={17} /><span>身份已锁定</span><strong>{summary.locked}</strong></article>
      </div>

      {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}

      {draft && createPortal(
        <div className="deliverable-editor-backdrop" role="presentation">
          <form className="deliverable-editor character-sheet-editor" onSubmit={saveDraft} role="dialog" aria-modal="true" aria-labelledby="character-sheet-editor-title">
            <header>
              <div><span>EDIT CHARACTER SETTING</span><h3 id="character-sheet-editor-title">编辑角色设定 · {draft.displayName || '新角色'}</h3></div>
              <button type="button" onClick={() => setDraft(null)} aria-label="关闭编辑"><X size={18} /></button>
            </header>
            {message?.type === 'error' && <div className="deliverable-editor-message inline-message error"><X size={16} />{message.text}</div>}
            <div className="deliverable-editor-grid">
              <label><span>稳定角色 ID</span><input value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} placeholder="例如：player_girl" maxLength={80} disabled={sheets.characters.some((character) => character.id === draft.id)} /></label>
              <label><span>角色名称</span><input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder="例如：小女孩探险家" maxLength={100} /></label>
              <label><span>角色类型</span><input value={draft.roleType} onChange={(event) => setDraft({ ...draft, roleType: event.target.value })} placeholder="主角 / 向导 / NPC / 宠物" maxLength={60} /></label>
              <label><span>生产优先级</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as CharacterPriority })}><option value="P0">P0 · 核心闭环</option><option value="P1">P1 · 首发内容</option><option value="P2">P2 · 扩展内容</option></select></label>
              <label><span>设定状态</span><select value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value as CharacterSettingState })}>{Object.entries(stateCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>设定版本</span><input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} placeholder="例如：v001" maxLength={60} /></label>
              <label className="full"><span>叙事与玩法职责</span><textarea value={draft.narrativeRole} onChange={(event) => setDraft({ ...draft, narrativeRole: event.target.value })} rows={3} maxLength={800} /></label>
              <label className="full"><span>年龄感、头身比与尺度</span><textarea value={draft.ageAndProportion} onChange={(event) => setDraft({ ...draft, ageAndProportion: event.target.value })} rows={3} maxLength={800} /></label>
              <label className="full"><span>不可改变的身份锚点</span><textarea value={draft.identityAnchors} onChange={(event) => setDraft({ ...draft, identityAnchors: event.target.value })} rows={3} maxLength={1200} /></label>
              <label className="full"><span>轮廓与外形特征</span><textarea value={draft.silhouetteAndFeatures} onChange={(event) => setDraft({ ...draft, silhouetteAndFeatures: event.target.value })} rows={3} maxLength={1000} /></label>
              <label className="full"><span>服装、配件与拆分关系</span><textarea value={draft.outfitAndAccessories} onChange={(event) => setDraft({ ...draft, outfitAndAccessories: event.target.value })} rows={3} maxLength={1200} /></label>
              <label className="full"><span>配色与材质</span><textarea value={draft.paletteAndMaterials} onChange={(event) => setDraft({ ...draft, paletteAndMaterials: event.target.value })} rows={3} maxLength={1000} /></label>
              <label className="full"><span>必需设定视图</span><textarea value={draft.requiredViews} onChange={(event) => setDraft({ ...draft, requiredViews: event.target.value })} rows={2} maxLength={600} /></label>
              <label className="full"><span>标准表情与核心姿态</span><textarea value={draft.expressionsAndPoses} onChange={(event) => setDraft({ ...draft, expressionsAndPoses: event.target.value })} rows={3} maxLength={1000} /></label>
              <label className="full"><span>动作模块交接要求</span><textarea value={draft.motionHandoff} onChange={(event) => setDraft({ ...draft, motionHandoff: event.target.value })} rows={3} maxLength={1200} /></label>
              <label className="full"><span>参考资产 ID（每行一个）</span><textarea value={draft.referenceAssetIdsText} onChange={(event) => setDraft({ ...draft, referenceAssetIdsText: event.target.value })} placeholder="asset-0000000000000-00000000" rows={3} maxLength={3000} /></label>
            </div>
            <footer><button className="button ghost" type="button" onClick={() => setDraft(null)}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存角色设定</button></footer>
          </form>
        </div>,
        document.body,
      )}

      {sheets.characters.length === 0 ? (
        <div className="character-sheets-empty"><UserRound size={28} /><strong>尚未登记角色设定</strong><p>先登记纵向切片所需的 P0 主角与向导，再扩展 NPC 和宠物。</p><button className="button primary" type="button" onClick={() => setDraft(newCharacterDraft())}><Plus size={16} /> 新增第一个角色</button></div>
      ) : (
        <div className="character-sheets-grid">
          {sheets.characters.map((character) => (
            <article className={`character-sheet-card ${character.state}`} key={character.id}>
              <header><span>{character.priority} · {character.roleType || '未分类'}</span><span className={`character-sheet-state ${character.state}`}>{stateCopy[character.state]}</span></header>
              <h3>{character.displayName}</h3>
              <code>{character.id}</code>
              <dl>
                <div><dt>叙事与玩法职责</dt><dd>{character.narrativeRole || '尚未填写'}</dd></div>
                <div><dt>年龄感与比例</dt><dd>{character.ageAndProportion || '尚未填写'}</dd></div>
                <div><dt>身份锚点</dt><dd>{character.identityAnchors || '尚未填写'}</dd></div>
                <div><dt>轮廓与外形</dt><dd>{character.silhouetteAndFeatures || '尚未填写'}</dd></div>
                <div><dt>服装与配件</dt><dd>{character.outfitAndAccessories || '尚未填写'}</dd></div>
                <div><dt>配色与材质</dt><dd>{character.paletteAndMaterials || '尚未填写'}</dd></div>
                <div><dt>必需视图</dt><dd>{character.requiredViews || '尚未填写'}</dd></div>
                <div><dt>表情与姿态</dt><dd>{character.expressionsAndPoses || '尚未填写'}</dd></div>
                <div><dt>动作交接</dt><dd>{character.motionHandoff || '尚未填写'}</dd></div>
              </dl>
              {character.referenceAssetIds.length > 0 && <div className="character-sheet-references"><strong>参考资产</strong>{character.referenceAssetIds.map((assetId) => <code key={assetId}>{assetId}</code>)}</div>}
              <footer>
                <small>{character.version} · {character.updatedAt ? new Date(character.updatedAt).toLocaleString('zh-CN') : '尚未保存'}</small>
                <div><button type="button" onClick={() => setDraft(toDraft(character))}><PencilLine size={14} /> 编辑</button><button className="danger" type="button" onClick={() => void removeCharacter(character)} disabled={saving}><Trash2 size={14} /> 删除</button></div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
