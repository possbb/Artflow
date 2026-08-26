import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  FileText,
  ImagePlus,
  Link2,
  LoaderCircle,
  PencilLine,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'

type DeliverableStatus = 'not_started' | 'in_progress' | 'in_review' | 'approved' | 'blocked'
type RightsStatus = 'pending' | 'cleared' | 'not_applicable'
type DeliverableContentKind = 'text' | 'image' | 'mixed'

type ImageAsset = {
  id: string
  moduleId: string
  name: string
  originalName: string
  imageUrl: string
  width?: number
  height?: number
}

type MainVisualDeliverable = {
  id: string
  order: number
  category: string
  title: string
  contentKind: DeliverableContentKind
  purpose: string
  acceptance: string
  contentText: string
  imageAssetIds: string[]
  status: DeliverableStatus
  owner: string
  version: string
  rightsStatus: RightsStatus
  updatedAt: string
}

type MainVisualDeliverables = {
  schemaVersion: number
  projectId: string
  updatedAt: string
  items: MainVisualDeliverable[]
}

const statusCopy: Record<DeliverableStatus, string> = {
  not_started: '未开始',
  in_progress: '制作中',
  in_review: '待审核',
  approved: '已批准',
  blocked: '已阻塞',
}

const rightsCopy: Record<RightsStatus, string> = {
  pending: '权利待确认',
  cleared: '权利已确认',
  not_applicable: '不涉及外部权利',
}

const contentKindCopy: Record<DeliverableContentKind, string> = {
  text: '文字交付',
  image: '图片交付',
  mixed: '图文交付',
}

const defaultDeliverableOwner = 'weiyuchen'
const defaultDeliverableVersion = 'v001'
const defaultRightsStatus: RightsStatus = 'not_applicable'

const definitions = [
  ['creative-brief', '定义', '主视觉创意简报', 'text', '统一记录世界观、目标受众、核心体验、平台、情绪和禁止方向。', '内容与玩法设计和详细玩法设计一致；范围、受众、平台和禁止项均有明确结论。'],
  ['style-exploration-boards', '探索', '风格探索板（至少 3 组）', 'image', '对构图、色彩、材质、光照和细节密度进行可比较的风格探索。', '至少 3 组方案并排比较；记录筛选理由、淘汰原因和最终选择。'],
  ['gameplay-anchor', '核心图像', '游戏镜头主视觉锚点图', 'image', '在实际游戏镜头下验证角色、场景、路线、线索和交互目标的可读性。', '使用目标宽高比和固定镜头；角色、路线、线索与宝箱层级清楚，并通过实际缩放检查。'],
  ['key-visual', '核心图像', '展示性关键视觉图', 'image', '用于宣传与项目展示，同时保持与游戏内视觉一致。', '角色身份、材质、光向和色板与游戏镜头锚点一致；常见裁切比例下核心主体完整。'],
  ['visual-bible', '视觉系统', '项目视觉圣经', 'mixed', '记录全项目视觉固定规则、允许变化、禁止元素、例外审批和版本影响范围；技术接入规则只引用技术美术规范。', '下游模块无需重新猜测风格；视觉圣经不重复维护路径、命名、导入、层级编号、性能预算或运行时清单。'],
  ['color-system', '视觉系统', '项目色彩与功能色系统', 'mixed', '定义主色、辅色、强调色、中性色以及交互和功能色优先级。', '提供色值、使用比例、背景适配、对比度和主线／隐藏／交互目标的颜色层级。'],
  ['shape-language', '视觉系统', '形状、轮廓与装饰语言', 'mixed', '定义角色、建筑、道具、图标的轮廓倾向、圆角、边缘和装饰母题。', '提供可复用的正反例；不同模块并排时保持同一形状语言且不损害可读性。'],
  ['material-lighting-samples', '渲染系统', '材质、光照、阴影与后期样张', 'mixed', '锁定表面质感、纹理密度、主光方向、环境光、接地阴影和后期色调。', '至少覆盖角色、建筑、地面、金属、布料和魔法效果；明暗场景下均保持统一且可读。'],
  ['module-adaptation-samples', '下游验证', '下游模块适配样张', 'mixed', '验证主视觉规则能够稳定扩展到角色、场景、地图元素、交互反馈和用户界面。', '至少包含角色、场景、交互物和界面四类样张；并排检查色板、材质、轮廓、镜头和细节密度。'],
  ['final-approval', '批准归档', '主视觉最终批准与影响记录', 'text', '登记批准版本、权利结论和受影响模块。', '全部前置交付物已批准；主视觉正式版本可追溯，权利状态明确，下游影响与例外均已记录。'],
] as const

function emptyDeliverables(projectId: string): MainVisualDeliverables {
  return {
    schemaVersion: 2,
    projectId,
    updatedAt: '',
    items: definitions.map(([id, category, title, contentKind, purpose, acceptance], index) => ({
      id,
      order: index + 1,
      category,
      title,
      contentKind,
      purpose,
      acceptance,
      contentText: '',
      imageAssetIds: [],
      status: 'not_started',
      owner: defaultDeliverableOwner,
      version: defaultDeliverableVersion,
      rightsStatus: defaultRightsStatus,
      updatedAt: '',
    })),
  }
}

function stripLegacyReviewFields(item: Partial<MainVisualDeliverable> | undefined) {
  const cleaned = { ...item } as Partial<MainVisualDeliverable> & Record<string, unknown>
  delete cleaned.evidence
  delete cleaned.reviewNotes
  delete cleaned.approvedBy
  delete cleaned.approvedAt
  return cleaned
}

function normalizeStaticDeliverables(projectId: string, value: Partial<MainVisualDeliverables> | null): MainVisualDeliverables {
  const fallback = emptyDeliverables(projectId)
  const incoming = Array.isArray(value?.items) ? value.items : []
  return {
    ...fallback,
    ...value,
    schemaVersion: 2,
    projectId,
    items: fallback.items.map((definition) => {
      const item = incoming.find((candidate) => candidate.id === definition.id)
      return {
        ...definition,
        ...stripLegacyReviewFields(item),
        contentKind: definition.contentKind,
        contentText: typeof item?.contentText === 'string' ? item.contentText : '',
        imageAssetIds: Array.isArray(item?.imageAssetIds) ? item.imageAssetIds : [],
        owner: typeof item?.owner === 'string' && item.owner.trim() ? item.owner.trim() : defaultDeliverableOwner,
        version: typeof item?.version === 'string' && item.version.trim() ? item.version.trim() : defaultDeliverableVersion,
        rightsStatus: item?.rightsStatus === 'pending' || item?.rightsStatus === 'cleared' || item?.rightsStatus === 'not_applicable' ? item.rightsStatus : defaultRightsStatus,
      }
    }),
  }
}

export function MainVisualDeliverablesPanel({ projectId, staticDemo }: { projectId: string; staticDemo: boolean }) {
  const [register, setRegister] = useState<MainVisualDeliverables | null>(null)
  const [draft, setDraft] = useState<MainVisualDeliverable | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([])
  const [uploadingItemId, setUploadingItemId] = useState('')
  const [deletingAssetId, setDeletingAssetId] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setDraft(null)
    setMessage(null)
    void (async () => {
      try {
        if (staticDemo) {
          const stored = window.localStorage.getItem(`artflow:main-visual-deliverables:${projectId}:v1`)
          setRegister(normalizeStaticDeliverables(projectId, stored ? JSON.parse(stored) : null))
        } else {
          const query = new URLSearchParams({ projectId, moduleId: 'main-visual-design' })
          const [deliverablesResponse, assetsResponse] = await Promise.all([
            fetch(`/api/projects/${projectId}/main-visual-deliverables`),
            fetch(`/api/image-assets?${query}`),
          ])
          const [deliverablesResult, assetsResult] = await Promise.all([deliverablesResponse.json(), assetsResponse.json()])
          if (!deliverablesResponse.ok) throw new Error(deliverablesResult.error || '主视觉交付物记录读取失败。')
          if (!assetsResponse.ok) throw new Error(assetsResult.error || '主视觉交付图片读取失败。')
          setRegister(deliverablesResult)
          setImageAssets(assetsResult)
        }
      } catch (loadError) {
        setRegister(null)
        setMessage({ type: 'error', text: loadError instanceof Error ? loadError.message : '主视觉交付物记录读取失败。' })
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
    const items = register?.items || []
    const approved = items.filter((item) => item.status === 'approved').length
    return {
      total: items.length,
      approved,
      inProgress: items.filter((item) => item.status === 'in_progress').length,
      inReview: items.filter((item) => item.status === 'in_review').length,
      blocked: items.filter((item) => item.status === 'blocked').length,
      pendingRights: items.filter((item) => item.rightsStatus === 'pending').length,
      completion: items.length ? Math.round((approved / items.length) * 100) : 0,
    }
  }, [register])

  const saveRegister = async (nextRegister: MainVisualDeliverables, validationItemId = '') => {
    const value = { ...nextRegister, updatedAt: new Date().toISOString() }
    if (staticDemo) {
      window.localStorage.setItem(`artflow:main-visual-deliverables:${projectId}:v1`, JSON.stringify(value))
      setRegister(value)
      return value
    }
    const response = await fetch(`/api/projects/${projectId}/main-visual-deliverables`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliverables: value, validationItemId }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '主视觉交付物记录保存失败。')
    setRegister(result.deliverables)
    return result.deliverables as MainVisualDeliverables
  }

  const persist = async (nextRegister: MainVisualDeliverables, successMessage: string, validationItemId = '') => {
    setSaving(true)
    setMessage(null)
    try {
      await saveRegister(nextRegister, validationItemId)
      setDraft(null)
      setMessage({ type: 'success', text: successMessage })
    } catch (saveError) {
      setMessage({ type: 'error', text: saveError instanceof Error ? saveError.message : '主视觉交付物记录保存失败。' })
    } finally {
      setSaving(false)
    }
  }

  const uploadImages = async (item: MainVisualDeliverable, files: File[]) => {
    if (!register || files.length === 0) return
    if (staticDemo) return setMessage({ type: 'error', text: '在线演示版不保存图片，请在本地项目中上传。' })
    setUploadingItemId(item.id)
    setMessage(null)
    try {
      const formData = new FormData()
      for (const file of files) formData.append('images', file)
      formData.append('projectId', projectId)
      formData.append('moduleId', 'main-visual-design')
      formData.append('name', `main_visual_${item.id.replaceAll('-', '_')}`)
      const response = await fetch('/api/image-assets', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '交付图片上传失败。')
      const created = result as ImageAsset[]
      const imageAssetIds = [...new Set([...item.imageAssetIds, ...created.map((asset) => asset.id)])]
      const updatedItem = { ...item, imageAssetIds, updatedAt: new Date().toISOString() }
      await saveRegister({ ...register, items: register.items.map((current) => current.id === item.id ? updatedItem : current) }, item.id)
      setImageAssets((current) => [...created, ...current])
      setMessage({ type: 'success', text: `已为“${item.title}”上传并绑定 ${created.length} 张图片。` })
    } catch (uploadError) {
      setMessage({ type: 'error', text: uploadError instanceof Error ? uploadError.message : '交付图片上传失败。' })
    } finally {
      setUploadingItemId('')
    }
  }

  const removeImage = async (item: MainVisualDeliverable, asset: ImageAsset) => {
    if (!register || !window.confirm(`确定从“${item.title}”中删除图片“${asset.name}”吗？`)) return
    setDeletingAssetId(asset.id)
    setMessage(null)
    try {
      const shared = register.items.some((current) => current.id !== item.id && current.imageAssetIds.includes(asset.id))
      const updatedItem = { ...item, imageAssetIds: item.imageAssetIds.filter((id) => id !== asset.id), updatedAt: new Date().toISOString() }
      await saveRegister({ ...register, items: register.items.map((current) => current.id === item.id ? updatedItem : current) }, item.id)
      if (!shared && !staticDemo) {
        const response = await fetch(`/api/image-assets/${asset.moduleId}/${asset.id}?projectId=${projectId}`, { method: 'DELETE' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '图片源文件删除失败。')
        setImageAssets((current) => current.filter((candidate) => candidate.id !== asset.id))
      }
      setMessage({ type: 'success', text: shared ? '已从当前交付物解除图片绑定；该图片仍被其他交付物使用。' : `已删除“${asset.name}”。` })
    } catch (deleteError) {
      setMessage({ type: 'error', text: deleteError instanceof Error ? deleteError.message : '交付图片删除失败。' })
    } finally {
      setDeletingAssetId('')
    }
  }

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!register || !draft) return
    if (draft.status === 'approved' && (!draft.version.trim() || draft.rightsStatus === 'pending')) {
      setMessage({ type: 'error', text: '标记为已批准前，请填写版本和权利结论。' })
      return
    }
    const item = {
      ...draft,
      contentText: draft.contentText.trim(),
      owner: draft.owner.trim(),
      version: draft.version.trim(),
      updatedAt: new Date().toISOString(),
    }
    void persist({ ...register, items: register.items.map((current) => current.id === item.id ? item : current) }, `已更新“${item.title}”的交付记录。`, item.id)
  }

  if (loading) return <div className="deliverables-loading"><LoaderCircle className="spin" size={24} /> 正在读取主视觉交付物…</div>
  if (!register) return <div className="deliverables-loading is-error"><X size={23} /> {message?.text || '主视觉交付物记录不可用。'}</div>

  return (
    <section className="main-visual-deliverables" data-purpose="main-visual-deliverables" aria-labelledby="main-visual-deliverables-title">
      <header className="deliverables-header">
        <div className="deliverables-title-icon"><ClipboardCheck size={23} /></div>
        <div>
          <span>MAIN VISUAL DELIVERABLE REGISTER</span>
          <h2 id="main-visual-deliverables-title">主视觉交付物管理与批准记录</h2>
          <p>把主视觉要求落实为可追踪的正式交付物；只有内容、版本与权利结论齐全的项目才能计入完成。</p>
        </div>
        <div className={`deliverables-readiness${summary.approved === summary.total ? ' ready' : ''}`}>
          <strong>{summary.approved}/{summary.total}</strong>
          <span>{summary.approved === summary.total ? '主视觉交付完成' : '已批准交付物'}</span>
        </div>
      </header>

      <div className="deliverables-summary" aria-label="主视觉交付物概览">
        <article><FileCheck2 size={17} /><span>完成度</span><strong>{summary.completion}%</strong></article>
        <article><PencilLine size={17} /><span>制作中</span><strong>{summary.inProgress}</strong></article>
        <article><ShieldCheck size={17} /><span>待审核</span><strong>{summary.inReview}</strong></article>
        <article className={summary.blocked ? 'attention' : ''}><CircleAlert size={17} /><span>阻塞</span><strong>{summary.blocked}</strong></article>
        <article className={summary.pendingRights ? 'attention' : ''}><Link2 size={17} /><span>权利待确认</span><strong>{summary.pendingRights}</strong></article>
      </div>

      {message && <div className={`inline-message ${message.type}`}>{message.type === 'success' ? <Check size={16} /> : <X size={16} />}{message.text}</div>}

      {draft && createPortal(
        <div className="deliverable-editor-backdrop" role="presentation">
          <form className="deliverable-editor" onSubmit={saveDraft} role="dialog" aria-modal="true" aria-labelledby="deliverable-editor-title">
            <header>
              <div><span>EDIT DELIVERABLE RECORD</span><h3 id="deliverable-editor-title">编辑交付记录 · {draft.title}</h3></div>
              <button type="button" onClick={() => setDraft(null)} aria-label="关闭编辑"><X size={18} /></button>
            </header>
            {message?.type === 'error' && <div className="deliverable-editor-message inline-message error"><X size={16} />{message.text}</div>}
            <div className="deliverable-editor-grid">
              <label className="full deliverable-content-editor"><span>交付正文（选填）</span><textarea value={draft.contentText} onChange={(event) => setDraft({ ...draft, contentText: event.target.value })} placeholder="可选：说明本交付物包含什么、用于验证哪些主视觉规则，以及下游如何引用。" rows={8} maxLength={20000} /><small>{draft.contentText.length}/20000 字符</small></label>
              <label><span>制作状态</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as DeliverableStatus })}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>权利状态</span><select value={draft.rightsStatus} onChange={(event) => setDraft({ ...draft, rightsStatus: event.target.value as RightsStatus })}>{Object.entries(rightsCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>负责人</span><input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="姓名或岗位" maxLength={80} /></label>
              <label><span>交付版本</span><input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} placeholder="例如：v001" maxLength={60} /></label>
            </div>
            <footer><button className="button ghost" type="button" onClick={() => setDraft(null)}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} 保存交付记录</button></footer>
          </form>
        </div>,
        document.body,
      )}

      <div className="deliverables-grid">
        {register.items.map((item) => (
          <article className={`deliverable-card ${item.status}`} key={item.id}>
            <header>
              <span>{String(item.order).padStart(2, '0')} · {item.category} · {contentKindCopy[item.contentKind]}</span>
              <span className={`deliverable-status ${item.status}`}>{statusCopy[item.status]}</span>
            </header>
            <h3>{item.title}</h3>
            <p>{item.purpose}</p>
            <div className="deliverable-acceptance"><Check size={14} /><span><strong>通过条件</strong>{item.acceptance}</span></div>
            <div className="deliverable-record-meta">
              <span><UserRound size={13} /> {item.owner || '未指定负责人'}</span>
              <span><FileCheck2 size={13} /> {item.version || '未登记版本'}</span>
              <span className={item.rightsStatus === 'pending' ? 'pending' : ''}><Link2 size={13} /> {rightsCopy[item.rightsStatus]}</span>
            </div>
            <div className={`deliverable-content-text${item.contentText ? '' : ' is-empty'}`}>
              <strong><FileText size={13} /> 交付正文</strong>
              {item.contentText ? <p>{item.contentText}</p> : <p>尚未录入交付正文；如需补充交付说明，可随时编辑。</p>}
            </div>
            {item.contentKind !== 'text' && (
              <div className="deliverable-images">
                <div className="deliverable-images-heading">
                  <strong><ImagePlus size={13} /> 交付图片 · {item.imageAssetIds.length} 张</strong>
                  <label className={uploadingItemId === item.id ? 'is-busy' : ''}>
                    {uploadingItemId === item.id ? <LoaderCircle className="spin" size={13} /> : <Upload size={13} />}
                    {uploadingItemId === item.id ? '上传中…' : '上传图片'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={Boolean(uploadingItemId)} onChange={(event) => { const files = Array.from(event.target.files || []); event.currentTarget.value = ''; void uploadImages(item, files) }} />
                  </label>
                </div>
                {item.imageAssetIds.length > 0 ? (
                  <div className="deliverable-image-grid">
                    {item.imageAssetIds.map((assetId) => {
                      const asset = imageAssets.find((candidate) => candidate.id === assetId)
                      if (!asset) return <div className="deliverable-image-missing" key={assetId}><CircleAlert size={15} /><span>图片记录缺失<br /><small>{assetId}</small></span></div>
                      return (
                        <figure className="deliverable-image-card" key={asset.id}>
                          <a href={asset.imageUrl} target="_blank" rel="noreferrer"><img src={asset.imageUrl} alt={asset.originalName || asset.name} /></a>
                          <figcaption><span title={asset.originalName || asset.name}>图片名称：{asset.originalName || asset.name}</span><button type="button" disabled={deletingAssetId === asset.id} onClick={() => void removeImage(item, asset)} aria-label={`删除图片 ${asset.originalName || asset.name}`}>{deletingAssetId === asset.id ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />} 删除</button></figcaption>
                        </figure>
                      )
                    })}
                  </div>
                ) : <p className="deliverable-images-empty">尚未上传交付图片。</p>}
              </div>
            )}
            <footer><small>{item.updatedAt ? `更新于 ${new Date(item.updatedAt).toLocaleString('zh-CN')}` : '尚未维护交付记录'}</small><button onClick={() => { setDraft({ ...item, owner: item.owner || defaultDeliverableOwner, version: item.version || defaultDeliverableVersion, rightsStatus: item.rightsStatus === 'pending' ? defaultRightsStatus : item.rightsStatus, status: 'approved' }); setMessage(null) }}><PencilLine size={14} />{item.contentText ? '编辑交付正文' : '录入交付正文'}</button></footer>
          </article>
        ))}
      </div>
    </section>
  )
}
